/**
 * Admin API Routes
 *
 * Provides admin-only endpoints for user management, system config,
 * notifications, and audit logs. All routes require admin or super_admin role.
 */

import { Router, Request, Response } from 'express';
import { query, queryOne } from './db/auth-connection';
import { requireAuth, requireAdmin, requireModerator, requireSuperAdmin, logAdminAction } from './middleware/auth';
import {
  DbUser,
  sanitizeUserV2,
  findUserByIdV2,
  updateUserRoleV2,
  getUserStatsV2,
  getAdminUsersV2,
  getUsersByRoleV2,
} from './auth/store-v2';
import { UserRole } from './auth/jwt';
import {
  notifyTierChange,
  notifyRoleChange,
  notifyFeatureFlagChange,
  notifyFeatureFlagOverride,
  notifyRateLimitChange,
  notifyRateLimitOverride,
  notifyAccountUnlocked,
  notifySessionRevoked,
  notifyApiKeyCreated,
  notifyApiKeyRevoked,
  notifyApiKeyUpdated,
} from './ws-admin-broadcast';
import {
  createApiKey,
  getKeyById,
  updateKey,
  revokeKey,
  type ApiKey,
} from './db/api-key-store';
import { getRedis } from './lib/redis';
import { pythonBackendUrl } from './lib/python-backend-url';

const router = Router();

// IANA timezone names: letters, digits, '_', '/', '+', '-'. Postgres rejects anything else.
const IANA_TZ_RE = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/;
function resolveTz(raw: unknown): string {
  return typeof raw === 'string' && IANA_TZ_RE.test(raw) ? raw : 'UTC';
}

// ============================================================================
// SYSTEM HEALTH CHECK UTILITY
// ============================================================================

interface SystemHealth {
  database: 'healthy' | 'degraded' | 'down';
  cache: 'healthy' | 'degraded' | 'down';
  api: 'healthy' | 'degraded' | 'down';
  lastCheck: string;
}

async function checkSystemHealth(): Promise<SystemHealth> {
  const health: SystemHealth = {
    database: 'down',
    cache: 'down',
    api: 'down',
    lastCheck: new Date().toISOString(),
  };

  // Use direct Python backend URL for server-to-server health checks
  // VITE_GRADIO_BASE_URL may point to nginx (e.g. localhost:81) which doesn't route /health/*
  const pyUrl = pythonBackendUrl();

  // Check Node.js auth database (PostgreSQL)
  try {
    await query('SELECT 1');
    health.database = 'healthy';
  } catch (error) {
    console.error('[HEALTH] Database check failed:', error);
    health.database = 'down';
  }

  // Check Redis cache via Python backend
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const cacheRes = await fetch(`${pyUrl}/health/cache`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (cacheRes.ok) {
      const data = await cacheRes.json();
      health.cache = data.status === 'healthy' ? 'healthy' :
                     data.status === 'degraded' ? 'degraded' : 'down';
    } else {
      health.cache = 'degraded';
    }
  } catch (error) {
    console.error('[HEALTH] Cache check failed:', error);
    health.cache = 'down';
  }

  // Check Python backend API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const apiRes = await fetch(`${pyUrl}/health/db`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (apiRes.ok) {
      const data = await apiRes.json();
      health.api = data.status === 'healthy' ? 'healthy' :
                   data.status === 'degraded' ? 'degraded' : 'down';
    } else {
      health.api = 'degraded';
    }
  } catch (error) {
    console.error('[HEALTH] API check failed:', error);
    health.api = 'down';
  }

  return health;
}

// ============================================================================
// DASHBOARD STATISTICS ENDPOINT
// ============================================================================

/**
 * GET /api/admin/stats
 * Get comprehensive admin dashboard statistics
 */
router.get(
  '/stats',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      // User counts by role
      const roleResult = await query(`
        SELECT
          COALESCE(role, 'user') as role,
          COUNT(*) as count
        FROM users
        GROUP BY role
      `);
      const byRole = {
        user: 0,
        moderator: 0,
        admin: 0,
        super_admin: 0,
      };
      roleResult.rows.forEach((row: any) => {
        byRole[row.role as keyof typeof byRole] = parseInt(row.count);
      });

      // User counts by tier
      const tierResult = await query(`
        SELECT tier, COUNT(*) as count
        FROM users
        GROUP BY tier
      `);
      const byTier = { basic: 0, premium: 0 };
      tierResult.rows.forEach((row: any) => {
        byTier[row.tier as keyof typeof byTier] = parseInt(row.count);
      });

      // User counts by provider
      const providerResult = await query(`
        SELECT provider, COUNT(*) as count
        FROM users
        GROUP BY provider
      `);
      const byProvider = { password: 0, google: 0 };
      providerResult.rows.forEach((row: any) => {
        byProvider[row.provider as keyof typeof byProvider] = parseInt(row.count);
      });

      // Total, active, locked counts
      const statusResult = await queryOne<{
        total: string;
        active: string;
        locked: string;
        email_verified: string;
      }>(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(*) FILTER (WHERE locked_until > NOW()) as locked,
          COUNT(*) FILTER (WHERE email_verified = true) as email_verified
        FROM users
      `);

      // Recent activity stats
      const activityResult = await queryOne<{
        signups_today: string;
        signups_week: string;
        signups_month: string;
        logins_today: string;
        logins_week: string;
        failed_today: string;
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as signups_today,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as signups_week,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as signups_month,
          COUNT(*) FILTER (WHERE last_login_at >= CURRENT_DATE) as logins_today,
          COUNT(*) FILTER (WHERE last_login_at >= CURRENT_DATE - INTERVAL '7 days') as logins_week,
          0 as failed_today
        FROM users
      `);

      // Get failed login count from auth_logs if table exists
      let failedLoginsToday = 0;
      try {
        const failedResult = await queryOne<{ count: string }>(`
          SELECT COUNT(*) as count
          FROM auth_logs
          WHERE event_type = 'failed_login'
            AND created_at >= CURRENT_DATE
        `);
        failedLoginsToday = parseInt(failedResult?.count || '0');
      } catch {
        // auth_logs table might not exist yet
      }

      // Check real system health (database, cache, API)
      const systemHealth = await checkSystemHealth();

      res.json({
        users: {
          total: parseInt(statusResult?.total || '0'),
          byRole,
          byTier,
          byProvider,
          active: parseInt(statusResult?.active || '0'),
          locked: parseInt(statusResult?.locked || '0'),
          emailVerified: parseInt(statusResult?.email_verified || '0'),
        },
        activity: {
          signupsToday: parseInt(activityResult?.signups_today || '0'),
          signupsThisWeek: parseInt(activityResult?.signups_week || '0'),
          signupsThisMonth: parseInt(activityResult?.signups_month || '0'),
          loginsToday: parseInt(activityResult?.logins_today || '0'),
          loginsThisWeek: parseInt(activityResult?.logins_week || '0'),
          failedLoginsToday,
        },
        system: systemHealth,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting stats:', error.message);
      res.status(500).json({ message: 'Failed to get statistics' });
    }
  }
);

/**
 * GET /api/admin/analytics/signups
 * Get daily signup counts for time-series chart
 */
router.get(
  '/analytics/signups',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const days = Math.min(parseInt(req.query.days as string) || 30, 90);
      const tz = resolveTz(req.query.tz);

      // Bucket by viewer's local calendar day (not UTC) so "today" lines up with the viewer's wall clock.
      const result = await query(`
        WITH bounds AS (
          SELECT (date_trunc('day', NOW() AT TIME ZONE $1) - make_interval(days => $2 - 1))::date AS start_day,
                 date_trunc('day', NOW() AT TIME ZONE $1)::date AS end_day
        )
        SELECT
          to_char(date_trunc('day', created_at AT TIME ZONE $1), 'YYYY-MM-DD') as date,
          COUNT(*) as count,
          COUNT(*) FILTER (WHERE tier = 'premium') as premium_count,
          COUNT(*) FILTER (WHERE provider = 'google') as google_count
        FROM users, bounds
        WHERE (created_at AT TIME ZONE $1)::date BETWEEN bounds.start_day AND bounds.end_day
        GROUP BY 1
        ORDER BY 1 ASC
      `, [tz, days]);

      const rowsByDate = new Map<string, any>();
      for (const r of result.rows) rowsByDate.set(r.date, r);

      // Generate the day list in the requested TZ so a viewer never sees a future-dated bar.
      const nowParts = await query(
        `SELECT to_char(date_trunc('day', NOW() AT TIME ZONE $1) - make_interval(days => g), 'YYYY-MM-DD') AS d
         FROM generate_series(0, $2 - 1) AS g
         ORDER BY g DESC`,
        [tz, days]
      );

      const data = nowParts.rows.map((d: any) => {
        const row = rowsByDate.get(d.d);
        return {
          date: d.d,
          count: row ? parseInt(row.count) : 0,
          premium: row ? parseInt(row.premium_count) : 0,
          google: row ? parseInt(row.google_count) : 0,
        };
      });

      res.json({ data });
    } catch (error: any) {
      console.error('[ADMIN] Error getting signup analytics:', error.message);
      res.status(500).json({ message: 'Failed to get signup analytics' });
    }
  }
);

/**
 * GET /api/admin/analytics/logins
 * Get daily login counts for time-series chart
 */
router.get(
  '/analytics/logins',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const days = Math.min(parseInt(req.query.days as string) || 30, 90);
      const tz = resolveTz(req.query.tz);

      const result = await query(`
        WITH bounds AS (
          SELECT (date_trunc('day', NOW() AT TIME ZONE $1) - make_interval(days => $2 - 1))::date AS start_day,
                 date_trunc('day', NOW() AT TIME ZONE $1)::date AS end_day
        )
        SELECT
          to_char(date_trunc('day', created_at AT TIME ZONE $1), 'YYYY-MM-DD') as date,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE success = true) as success_count,
          COUNT(*) FILTER (WHERE success = false) as failed_count,
          COUNT(DISTINCT user_id) FILTER (WHERE success = true) as unique_users
        FROM auth_logs, bounds
        WHERE event_type IN ('login', 'failed_login')
          AND (created_at AT TIME ZONE $1)::date BETWEEN bounds.start_day AND bounds.end_day
        GROUP BY 1
        ORDER BY 1 ASC
      `, [tz, days]);

      const rowsByDate = new Map<string, any>();
      for (const r of result.rows) rowsByDate.set(r.date, r);

      const dayList = await query(
        `SELECT to_char(date_trunc('day', NOW() AT TIME ZONE $1) - make_interval(days => g), 'YYYY-MM-DD') AS d
         FROM generate_series(0, $2 - 1) AS g
         ORDER BY g DESC`,
        [tz, days]
      );

      const data = dayList.rows.map((d: any) => {
        const row = rowsByDate.get(d.d);
        return {
          date: d.d,
          total: row ? parseInt(row.total) : 0,
          success: row ? parseInt(row.success_count) : 0,
          failed: row ? parseInt(row.failed_count) : 0,
          uniqueUsers: row ? parseInt(row.unique_users) : 0,
        };
      });

      res.json({ data });
    } catch (error: any) {
      console.error('[ADMIN] Error getting login analytics:', error.message);
      res.status(500).json({ message: 'Failed to get login analytics' });
    }
  }
);

/**
 * GET /api/admin/analytics/retention
 * Get user retention and engagement metrics
 */
router.get(
  '/analytics/retention',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      // Users who logged in within different time periods
      const retentionResult = await query(`
        SELECT
          COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '1 day') as day_1,
          COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '7 days') as day_7,
          COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '30 days') as day_30,
          COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '90 days') as day_90,
          COUNT(*) as total
        FROM users
        WHERE last_login_at IS NOT NULL
      `);

      // Churned users (no login in 30+ days)
      const churnResult = await queryOne<{ churned: string }>(`
        SELECT COUNT(*) as churned
        FROM users
        WHERE (last_login_at IS NULL AND created_at < NOW() - INTERVAL '30 days')
           OR (last_login_at < NOW() - INTERVAL '30 days')
      `);

      // New user retention (signed up in last 7 days, logged in again)
      const newUserRetentionResult = await queryOne<{ new_users: string; retained: string }>(`
        SELECT
          COUNT(*) as new_users,
          COUNT(*) FILTER (WHERE last_login_at > created_at + INTERVAL '1 day') as retained
        FROM users
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `);

      const row = retentionResult.rows[0];
      const total = parseInt(row?.total || '0');

      res.json({
        activeUsers: {
          day1: parseInt(row?.day_1 || '0'),
          day7: parseInt(row?.day_7 || '0'),
          day30: parseInt(row?.day_30 || '0'),
          day90: parseInt(row?.day_90 || '0'),
        },
        retentionRates: {
          day1: total > 0 ? Math.round((parseInt(row?.day_1 || '0') / total) * 100) : 0,
          day7: total > 0 ? Math.round((parseInt(row?.day_7 || '0') / total) * 100) : 0,
          day30: total > 0 ? Math.round((parseInt(row?.day_30 || '0') / total) * 100) : 0,
          day90: total > 0 ? Math.round((parseInt(row?.day_90 || '0') / total) * 100) : 0,
        },
        churnedUsers: parseInt(churnResult?.churned || '0'),
        newUserRetention: {
          newUsers: parseInt(newUserRetentionResult?.new_users || '0'),
          retained: parseInt(newUserRetentionResult?.retained || '0'),
          rate: parseInt(newUserRetentionResult?.new_users || '0') > 0
            ? Math.round((parseInt(newUserRetentionResult?.retained || '0') / parseInt(newUserRetentionResult?.new_users || '0')) * 100)
            : 0,
        },
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting retention analytics:', error.message);
      res.status(500).json({ message: 'Failed to get retention analytics' });
    }
  }
);

/**
 * GET /api/admin/analytics/growth
 * Get user growth metrics over time
 */
router.get(
  '/analytics/growth',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const tz = resolveTz(req.query.tz);

      // Monthly growth for the past 12 months — bucketed in viewer TZ so month boundaries match local calendar.
      const monthlyResult = await query(`
        SELECT
          to_char(date_trunc('month', created_at AT TIME ZONE $1), 'YYYY-MM') as month,
          COUNT(*) as signups,
          COUNT(*) FILTER (WHERE tier = 'premium') as premium_signups
        FROM users
        WHERE (created_at AT TIME ZONE $1) >= date_trunc('month', NOW() AT TIME ZONE $1) - INTERVAL '11 months'
        GROUP BY 1
        ORDER BY 1 ASC
      `, [tz]);

      let cumulative = 0;
      const monthlyData = monthlyResult.rows.map((row: any) => {
        cumulative += parseInt(row.signups);
        return {
          month: row.month,
          signups: parseInt(row.signups),
          premium: parseInt(row.premium_signups),
          cumulative,
        };
      });

      // Week-over-week growth — week-starts are also in viewer TZ.
      const wowResult = await query(`
        WITH weekly AS (
          SELECT
            to_char(date_trunc('week', created_at AT TIME ZONE $1), 'YYYY-MM-DD') as week,
            COUNT(*) as count
          FROM users
          WHERE (created_at AT TIME ZONE $1) >= date_trunc('week', NOW() AT TIME ZONE $1) - INTERVAL '8 weeks'
          GROUP BY 1
          ORDER BY 1
        )
        SELECT
          week,
          count,
          LAG(count) OVER (ORDER BY week) as prev_count
        FROM weekly
      `, [tz]);

      const weeklyGrowth = wowResult.rows
        .filter((row: any) => row.prev_count !== null)
        .map((row: any) => ({
          week: row.week,
          count: parseInt(row.count),
          growth: row.prev_count > 0
            ? Math.round(((row.count - row.prev_count) / row.prev_count) * 100)
            : 0,
        }));

      res.json({
        monthly: monthlyData,
        weeklyGrowth,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting growth analytics:', error.message);
      res.status(500).json({ message: 'Failed to get growth analytics' });
    }
  }
);

// ============================================================================
// USER MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/users
 * List all users with pagination, search, and filters
 */
router.get(
  '/users',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;
      const search = (req.query.search as string) || '';
      const role = req.query.role as UserRole | undefined;
      const tier = req.query.tier as 'free' | 'semi' | 'pro' | undefined;
      const provider = req.query.provider as 'password' | 'google' | undefined;
      const sortBy = (req.query.sortBy as string) || 'created_at';
      const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';

      // Build dynamic WHERE clause
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (search) {
        conditions.push(`(
          LOWER(email) LIKE $${paramIndex} OR
          LOWER(username) LIKE $${paramIndex} OR
          LOWER(name) LIKE $${paramIndex}
        )`);
        params.push(`%${search.toLowerCase()}%`);
        paramIndex++;
      }

      if (role) {
        conditions.push(`role = $${paramIndex}`);
        params.push(role);
        paramIndex++;
      }

      if (tier) {
        conditions.push(`tier = $${paramIndex}`);
        params.push(tier);
        paramIndex++;
      }

      if (provider) {
        conditions.push(`provider = $${paramIndex}`);
        params.push(provider);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Validate sort column to prevent SQL injection
      const validSortColumns = ['created_at', 'last_login_at', 'email', 'username', 'role', 'tier'];
      const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';

      // Get total count
      const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM users ${whereClause}`,
        params
      );
      const total = parseInt(countResult?.count || '0');

      // Get users
      const usersResult = await query(
        `SELECT * FROM users ${whereClause}
         ORDER BY ${safeSortBy} ${sortOrder}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      const users = usersResult.rows.map((user: DbUser) => ({
        ...sanitizeUserV2(user),
        lastLoginAt: user.last_login_at?.toISOString() || null,
        lastLoginIp: user.last_login_ip,
        loginCount: user.login_count,
        isActive: user.is_active,
        lockedUntil: user.locked_until?.toISOString() || null,
      }));

      res.json({
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error('[ADMIN] Error listing users:', error.message);
      res.status(500).json({ message: 'Failed to list users' });
    }
  }
);

/**
 * GET /api/admin/users/stats
 * Get user statistics
 */
router.get(
  '/users/stats',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const stats = await getUserStatsV2();

      // Get role distribution
      const roleResult = await query(`
        SELECT role, COUNT(*) as count
        FROM users
        GROUP BY role
        ORDER BY count DESC
      `);

      const roleDistribution = roleResult.rows.reduce((acc: Record<string, number>, row: any) => {
        acc[row.role || 'user'] = parseInt(row.count);
        return acc;
      }, {});

      // Get subscription status distribution
      const subscriptionResult = await query(`
        SELECT subscription_status, COUNT(*) as count
        FROM users
        GROUP BY subscription_status
        ORDER BY count DESC
      `);

      const subscriptionDistribution = subscriptionResult.rows.reduce((acc: Record<string, number>, row: any) => {
        acc[row.subscription_status || 'none'] = parseInt(row.count);
        return acc;
      }, {});

      res.json({
        ...stats,
        roleDistribution,
        subscriptionDistribution,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting user stats:', error.message);
      res.status(500).json({ message: 'Failed to get user stats' });
    }
  }
);

/**
 * GET /api/admin/users/admins
 * List all admin users
 */
router.get(
  '/users/admins',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const admins = await getAdminUsersV2();
      res.json({
        admins: admins.map((user) => ({
          ...sanitizeUserV2(user),
          lastLoginAt: user.last_login_at?.toISOString() || null,
        })),
      });
    } catch (error: any) {
      console.error('[ADMIN] Error listing admins:', error.message);
      res.status(500).json({ message: 'Failed to list admins' });
    }
  }
);

/**
 * GET /api/admin/users/:id
 * Get a single user by ID
 */
router.get(
  '/users/:id',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const user = await findUserByIdV2(req.params.id);

      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      // Get user's sessions
      const sessionsResult = await query(
        `SELECT id, device_info, ip_address, issued_at, expires_at, last_activity_at, revoked
         FROM sessions
         WHERE user_id = $1
         ORDER BY issued_at DESC
         LIMIT 10`,
        [user.id]
      );

      // Get user's recent auth logs
      const logsResult = await query(
        `SELECT event_type, provider, ip_address, success, created_at
         FROM auth_logs
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [user.id]
      );

      res.json({
        user: {
          ...sanitizeUserV2(user),
          lastLoginAt: user.last_login_at?.toISOString() || null,
          lastLoginIp: user.last_login_ip,
          loginCount: user.login_count,
          failedLoginAttempts: user.failed_login_attempts,
          isActive: user.is_active,
          lockedUntil: user.locked_until?.toISOString() || null,
        },
        sessions: sessionsResult.rows,
        recentAuthLogs: logsResult.rows,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting user:', error.message);
      res.status(500).json({ message: 'Failed to get user' });
    }
  }
);

/**
 * PATCH /api/admin/users/:id/role
 * Update a user's role (super_admin only for admin roles)
 */
router.patch(
  '/users/:id/role',
  requireAuth,
  requireAdmin,
  logAdminAction('update_user_role'),
  async (req: Request, res: Response) => {
    try {
      const { role } = req.body as { role: UserRole };
      const targetUserId = req.params.id;
      const adminUserId = req.user!.userId;

      if (!role || !['user', 'moderator', 'admin', 'super_admin'].includes(role)) {
        res.status(400).json({ message: 'Invalid role' });
        return;
      }

      // Prevent self-demotion
      if (targetUserId === adminUserId && role !== req.user!.role) {
        res.status(400).json({ message: 'Cannot change your own role' });
        return;
      }

      const updatedUser = await updateUserRoleV2(targetUserId, role, adminUserId);

      // Log to admin audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, previous_value, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'update_role',
          'user',
          targetUserId,
          JSON.stringify({ role: updatedUser.role }),
          JSON.stringify({ role }),
          req.ip,
        ]
      );

      // Broadcast role change to user via WebSocket
      notifyRoleChange(targetUserId, role, updatedUser.role);

      res.json({
        message: 'Role updated successfully',
        user: sanitizeUserV2(updatedUser),
      });
    } catch (error: any) {
      console.error('[ADMIN] Error updating user role:', error.message);
      res.status(400).json({ message: error.message });
    }
  }
);

/**
 * PATCH /api/admin/users/:id/tier
 * Update a user's tier
 */
router.patch(
  '/users/:id/tier',
  requireAuth,
  requireAdmin,
  logAdminAction('update_user_tier'),
  async (req: Request, res: Response) => {
    try {
      const { tier } = req.body as { tier: 'free' | 'semi' | 'pro' };
      const targetUserId = req.params.id;
      const adminUserId = req.user!.userId;

      if (!tier || !['free', 'semi', 'pro'].includes(tier)) {
        res.status(400).json({ message: 'Invalid tier. Must be free, semi, or pro.' });
        return;
      }

      // Get current user
      const user = await findUserByIdV2(targetUserId);
      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      const oldTier = user.tier;

      // Update tier
      await query(
        `UPDATE users SET tier = $1, updated_at = NOW() WHERE id = $2`,
        [tier, targetUserId]
      );

      // Log to admin audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, previous_value, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'update_tier',
          'user',
          targetUserId,
          JSON.stringify({ tier: oldTier }),
          JSON.stringify({ tier }),
          req.ip,
        ]
      );

      const updatedUser = await findUserByIdV2(targetUserId);

      // Broadcast tier change to user via WebSocket
      notifyTierChange(targetUserId, tier, oldTier);

      res.json({
        message: 'Tier updated successfully',
        user: sanitizeUserV2(updatedUser!),
      });
    } catch (error: any) {
      console.error('[ADMIN] Error updating user tier:', error.message);
      res.status(500).json({ message: 'Failed to update tier' });
    }
  }
);

/**
 * POST /api/admin/users/:id/unlock
 * Unlock a locked user account
 */
router.post(
  '/users/:id/unlock',
  requireAuth,
  requireAdmin,
  logAdminAction('unlock_user'),
  async (req: Request, res: Response) => {
    try {
      const targetUserId = req.params.id;
      const adminUserId = req.user!.userId;

      await query(
        `UPDATE users SET locked_until = NULL, failed_login_attempts = 0, updated_at = NOW() WHERE id = $1`,
        [targetUserId]
      );

      // Log to admin audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [adminUserId, 'unlock_account', 'user', targetUserId, req.ip]
      );

      // Notify user that their account has been unlocked
      notifyAccountUnlocked(targetUserId);

      res.json({ message: 'Account unlocked successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error unlocking user:', error.message);
      res.status(500).json({ message: 'Failed to unlock account' });
    }
  }
);

/**
 * DELETE /api/admin/users/:id/sessions
 * Revoke all sessions for a user
 */
router.delete(
  '/users/:id/sessions',
  requireAuth,
  requireAdmin,
  logAdminAction('revoke_user_sessions'),
  async (req: Request, res: Response) => {
    try {
      const targetUserId = req.params.id;
      const adminUserId = req.user!.userId;

      const result = await query(
        `UPDATE sessions SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $1
         WHERE user_id = $2 AND revoked = FALSE`,
        ['admin_revocation', targetUserId]
      );

      // Log to admin audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          adminUserId,
          'revoke_sessions',
          'user',
          targetUserId,
          JSON.stringify({ sessionsRevoked: result.rowCount }),
          req.ip,
        ]
      );

      // Notify user that their session has been revoked (will force logout)
      notifySessionRevoked(targetUserId);

      res.json({
        message: 'Sessions revoked successfully',
        sessionsRevoked: result.rowCount,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error revoking sessions:', error.message);
      res.status(500).json({ message: 'Failed to revoke sessions' });
    }
  }
);

// ============================================================================
// BULK USER OPERATIONS
// ============================================================================

/**
 * POST /api/admin/users/bulk/tier
 * Bulk update tier for multiple users
 */
router.post(
  '/users/bulk/tier',
  requireAuth,
  requireAdmin,
  logAdminAction('bulk_update_tier'),
  async (req: Request, res: Response) => {
    try {
      const { userIds, tier } = req.body;
      const adminUserId = req.user!.userId;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        res.status(400).json({ message: 'userIds array is required' });
        return;
      }

      if (!['basic', 'premium'].includes(tier)) {
        res.status(400).json({ message: 'Invalid tier' });
        return;
      }

      // Limit bulk operations to 100 users at a time
      if (userIds.length > 100) {
        res.status(400).json({ message: 'Maximum 100 users per bulk operation' });
        return;
      }

      // Update all users
      const result = await query(
        `UPDATE users SET tier = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])`,
        [tier, userIds]
      );

      // Log to admin audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          adminUserId,
          'bulk_update_tier',
          'users',
          `${userIds.length} users`,
          JSON.stringify({ tier, userIds }),
          req.ip,
        ]
      );

      // Notify all affected users via WebSocket
      for (const userId of userIds) {
        notifyTierChange(userId, tier, undefined);
      }

      res.json({
        message: `${result.rowCount} users updated to ${tier} tier`,
        updated: result.rowCount,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error bulk updating tier:', error.message);
      res.status(500).json({ message: 'Failed to update tiers' });
    }
  }
);

/**
 * DELETE /api/admin/users/bulk/sessions
 * Bulk revoke sessions for multiple users
 */
router.delete(
  '/users/bulk/sessions',
  requireAuth,
  requireAdmin,
  logAdminAction('bulk_revoke_sessions'),
  async (req: Request, res: Response) => {
    try {
      const { userIds } = req.body;
      const adminUserId = req.user!.userId;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        res.status(400).json({ message: 'userIds array is required' });
        return;
      }

      // Limit bulk operations to 100 users at a time
      if (userIds.length > 100) {
        res.status(400).json({ message: 'Maximum 100 users per bulk operation' });
        return;
      }

      const result = await query(
        `UPDATE sessions SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $1
         WHERE user_id = ANY($2::uuid[]) AND revoked = FALSE`,
        ['admin_bulk_revocation', userIds]
      );

      // Log to admin audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          adminUserId,
          'bulk_revoke_sessions',
          'users',
          `${userIds.length} users`,
          JSON.stringify({ sessionsRevoked: result.rowCount, userIds }),
          req.ip,
        ]
      );

      // Notify all affected users via WebSocket (will force logout)
      for (const userId of userIds) {
        notifySessionRevoked(userId);
      }

      res.json({
        message: `${result.rowCount} sessions revoked for ${userIds.length} users`,
        sessionsRevoked: result.rowCount,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error bulk revoking sessions:', error.message);
      res.status(500).json({ message: 'Failed to revoke sessions' });
    }
  }
);

/**
 * POST /api/admin/users/export
 * Export selected users as CSV
 */
router.post(
  '/users/export',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { userIds } = req.body;

      let sql = `
        SELECT
          id, email, username, name, role, tier, provider,
          is_active, email_verified, created_at, last_login_at,
          locked_until, failed_login_attempts
        FROM users
      `;
      const params: any[] = [];

      // If userIds provided, filter to those users
      if (Array.isArray(userIds) && userIds.length > 0) {
        sql += ` WHERE id = ANY($1::uuid[])`;
        params.push(userIds);
      }

      sql += ` ORDER BY created_at DESC LIMIT 10000`;

      const result = await query(sql, params);

      // Generate CSV
      const headers = [
        'ID',
        'Email',
        'Username',
        'Name',
        'Role',
        'Tier',
        'Provider',
        'Active',
        'Email Verified',
        'Created At',
        'Last Login',
        'Locked Until',
        'Failed Attempts',
      ];

      const csvRows = [headers.join(',')];

      result.rows.forEach((row: any) => {
        const values = [
          row.id,
          `"${(row.email || '').replace(/"/g, '""')}"`,
          `"${(row.username || '').replace(/"/g, '""')}"`,
          `"${(row.name || '').replace(/"/g, '""')}"`,
          row.role,
          row.tier,
          row.provider,
          row.is_active,
          row.email_verified,
          row.created_at ? new Date(row.created_at).toISOString() : '',
          row.last_login_at ? new Date(row.last_login_at).toISOString() : '',
          row.locked_until ? new Date(row.locked_until).toISOString() : '',
          row.failed_login_attempts || 0,
        ];
        csvRows.push(values.join(','));
      });

      const csv = csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="users-export-${new Date().toISOString().split('T')[0]}.csv"`
      );
      res.send(csv);
    } catch (error: any) {
      console.error('[ADMIN] Error exporting users:', error.message);
      res.status(500).json({ message: 'Failed to export users' });
    }
  }
);

// ============================================================================
// SYSTEM CONFIG ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/config
 * Get all system configuration
 */
router.get(
  '/config',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;

      let sql = 'SELECT * FROM system_config';
      const params: any[] = [];

      if (category) {
        sql += ' WHERE category = $1';
        params.push(category);
      }

      sql += ' ORDER BY category, key';

      const result = await query(sql, params);

      // Group by category
      const config = result.rows.reduce((acc: Record<string, any>, row: any) => {
        if (!acc[row.category]) {
          acc[row.category] = {};
        }
        acc[row.category][row.key] = {
          value: row.value,
          description: row.description,
          updatedAt: row.updated_at,
          updatedBy: row.updated_by,
        };
        return acc;
      }, {});

      res.json({ config });
    } catch (error: any) {
      console.error('[ADMIN] Error getting config:', error.message);
      res.status(500).json({ message: 'Failed to get config' });
    }
  }
);

/**
 * PUT /api/admin/config/:category/:key
 * Update a system configuration value
 */
router.put(
  '/config/:category/:key',
  requireAuth,
  requireAdmin,
  logAdminAction('update_config'),
  async (req: Request, res: Response) => {
    try {
      const { category, key } = req.params;
      const { value } = req.body;
      const adminUserId = req.user!.userId;

      if (value === undefined) {
        res.status(400).json({ message: 'Value is required' });
        return;
      }

      // Get old value for audit log
      const oldResult = await queryOne<{ value: any }>(
        'SELECT value FROM system_config WHERE category = $1 AND key = $2',
        [category, key]
      );

      // Upsert config value (key is PRIMARY KEY, so conflict on key only)
      await query(
        `INSERT INTO system_config (category, key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (key) DO UPDATE
         SET value = $3, updated_by = $4, updated_at = NOW()`,
        [category, key, JSON.stringify(value), adminUserId]
      );

      // Log to admin audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, previous_value, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'update_config',
          'system_config',
          `${category}.${key}`,
          JSON.stringify({ value: oldResult?.value }),
          JSON.stringify({ value }),
          req.ip,
        ]
      );

      res.json({ message: 'Config updated successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error updating config:', error.message);
      res.status(500).json({ message: 'Failed to update config' });
    }
  }
);

// ============================================================================
// NOTIFICATION ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/notifications
 * List all system notifications
 */
router.get(
  '/notifications',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT
           id,
           title,
           message,
           type,
           target_audience as "targetAudience",
           is_active as "isActive",
           is_dismissible as "isDismissible",
           scheduled_start as "scheduledStart",
           scheduled_end as "scheduledEnd",
           created_at as "createdAt",
           created_by as "createdBy"
         FROM system_notifications
         ORDER BY created_at DESC`
      );

      res.json({ notifications: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error listing notifications:', error.message);
      res.status(500).json({ message: 'Failed to list notifications' });
    }
  }
);

/**
 * POST /api/admin/notifications
 * Create a new system notification
 */
router.post(
  '/notifications',
  requireAuth,
  requireAdmin,
  logAdminAction('create_notification'),
  async (req: Request, res: Response) => {
    try {
      const { title, message, type, target_audience, scheduled_start, scheduled_end, is_dismissible } = req.body;
      const adminUserId = req.user!.userId;

      if (!title || !message) {
        res.status(400).json({ message: 'Title and message are required' });
        return;
      }

      const result = await queryOne<{ id: string }>(
        `INSERT INTO system_notifications (title, message, type, target_audience, scheduled_start, scheduled_end, is_dismissible, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          title,
          message,
          type || 'info',
          target_audience || 'all',
          scheduled_start || null,
          scheduled_end || null,
          is_dismissible !== false,
          adminUserId,
        ]
      );

      res.status(201).json({
        message: 'Notification created successfully',
        id: result?.id,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error creating notification:', error.message);
      res.status(500).json({ message: 'Failed to create notification' });
    }
  }
);

/**
 * PUT /api/admin/notifications/:id
 * Update a system notification (full update)
 */
router.put(
  '/notifications/:id',
  requireAuth,
  requireAdmin,
  logAdminAction('update_notification'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      // Accept both camelCase (frontend) and snake_case
      const title = req.body.title;
      const message = req.body.message;
      const type = req.body.type;
      const targetAudience = req.body.targetAudience ?? req.body.target_audience;
      const scheduledStart = req.body.scheduledStart ?? req.body.scheduled_start;
      const scheduledEnd = req.body.scheduledEnd ?? req.body.scheduled_end;
      const isActive = req.body.isActive ?? req.body.is_active;
      const isDismissible = req.body.isDismissible ?? req.body.is_dismissible;

      await query(
        `UPDATE system_notifications
         SET title = COALESCE($1, title),
             message = COALESCE($2, message),
             type = COALESCE($3, type),
             target_audience = COALESCE($4, target_audience),
             scheduled_start = COALESCE($5, scheduled_start),
             scheduled_end = COALESCE($6, scheduled_end),
             is_active = COALESCE($7, is_active),
             is_dismissible = COALESCE($8, is_dismissible),
             updated_at = NOW()
         WHERE id = $9`,
        [title, message, type, targetAudience, scheduledStart, scheduledEnd, isActive, isDismissible, id]
      );

      res.json({ message: 'Notification updated successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error updating notification:', error.message);
      res.status(500).json({ message: 'Failed to update notification' });
    }
  }
);

/**
 * PATCH /api/admin/notifications/:id
 * Partial update a system notification (e.g., toggle isActive)
 */
router.patch(
  '/notifications/:id',
  requireAuth,
  requireAdmin,
  logAdminAction('update_notification'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Accept camelCase from frontend
      if (req.body.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        params.push(req.body.isActive);
      }
      if (req.body.title !== undefined) {
        updates.push(`title = $${paramIndex++}`);
        params.push(req.body.title);
      }
      if (req.body.message !== undefined) {
        updates.push(`message = $${paramIndex++}`);
        params.push(req.body.message);
      }
      if (req.body.type !== undefined) {
        updates.push(`type = $${paramIndex++}`);
        params.push(req.body.type);
      }
      if (req.body.isDismissible !== undefined) {
        updates.push(`is_dismissible = $${paramIndex++}`);
        params.push(req.body.isDismissible);
      }

      if (updates.length === 0) {
        res.status(400).json({ message: 'No fields to update' });
        return;
      }

      updates.push('updated_at = NOW()');
      params.push(id);

      await query(
        `UPDATE system_notifications SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        params
      );

      res.json({ message: 'Notification updated successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error patching notification:', error.message);
      res.status(500).json({ message: 'Failed to update notification' });
    }
  }
);

/**
 * DELETE /api/admin/notifications/:id
 * Delete a system notification
 */
router.delete(
  '/notifications/:id',
  requireAuth,
  requireAdmin,
  logAdminAction('delete_notification'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await query('DELETE FROM notification_dismissals WHERE notification_id = $1', [id]);
      await query('DELETE FROM system_notifications WHERE id = $1', [id]);

      res.json({ message: 'Notification deleted successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error deleting notification:', error.message);
      res.status(500).json({ message: 'Failed to delete notification' });
    }
  }
);

// ============================================================================
// AUDIT LOG ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/audit-logs
 * Get admin audit logs
 */
router.get(
  '/audit-logs',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = (page - 1) * limit;
      const adminId = req.query.adminId as string | undefined;
      const action = req.query.action as string | undefined;

      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (adminId) {
        conditions.push(`admin_user_id = $${paramIndex}`);
        params.push(adminId);
        paramIndex++;
      }

      if (action) {
        conditions.push(`action = $${paramIndex}`);
        params.push(action);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM admin_audit_log ${whereClause}`,
        params
      );
      const total = parseInt(countResult?.count || '0');

      const result = await query(
        `SELECT
           al.id,
           al.admin_user_id as "adminId",
           u.username as "adminUsername",
           u.email as "adminEmail",
           al.action,
           al.target_type as "targetType",
           al.target_id as "targetId",
           al.previous_value as "oldValue",
           al.new_value as "newValue",
           al.ip_address as "ipAddress",
           al.created_at as "createdAt"
         FROM admin_audit_log al
         LEFT JOIN users u ON al.admin_user_id = u.id
         ${whereClause}
         ORDER BY al.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      res.json({
        logs: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting audit logs:', error.message);
      res.status(500).json({ message: 'Failed to get audit logs' });
    }
  }
);

/**
 * GET /api/admin/auth-logs
 * Get authentication logs
 */
router.get(
  '/auth-logs',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = (page - 1) * limit;
      const userId = req.query.userId as string | undefined;
      const eventType = req.query.eventType as string | undefined;
      const success = req.query.success as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const search = (req.query.search as string) || '';

      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (userId) {
        conditions.push(`al.user_id = $${paramIndex}`);
        params.push(userId);
        paramIndex++;
      }

      if (eventType) {
        conditions.push(`al.event_type = $${paramIndex}`);
        params.push(eventType);
        paramIndex++;
      }

      if (success !== undefined) {
        conditions.push(`al.success = $${paramIndex}`);
        params.push(success === 'true');
        paramIndex++;
      }

      if (startDate) {
        conditions.push(`al.created_at >= $${paramIndex}`);
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        conditions.push(`al.created_at <= $${paramIndex}`);
        params.push(endDate);
        paramIndex++;
      }

      if (search) {
        conditions.push(`(u.email ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM auth_logs al LEFT JOIN users u ON al.user_id = u.id ${whereClause}`,
        params
      );
      const total = parseInt(countResult?.count || '0');

      const result = await query(
        `SELECT
           al.id,
           al.user_id as "userId",
           u.email,
           u.username,
           al.event_type as "eventType",
           al.provider,
           al.success,
           al.failure_reason as "failureReason",
           al.ip_address as "ipAddress",
           al.user_agent as "userAgent",
           al.metadata,
           al.created_at as "createdAt"
         FROM auth_logs al
         LEFT JOIN users u ON al.user_id = u.id
         ${whereClause}
         ORDER BY al.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      res.json({
        logs: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting auth logs:', error.message);
      res.status(500).json({ message: 'Failed to get auth logs' });
    }
  }
);

/**
 * GET /api/admin/auth-logs/ip-summary
 * Get failed login attempts aggregated by IP address
 */
router.get(
  '/auth-logs/ip-summary',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const minAttempts = parseInt(req.query.minAttempts as string) || 1;

      const conditions: string[] = ['al.success = false'];
      const params: any[] = [];
      let paramIndex = 1;

      if (startDate) {
        conditions.push(`al.created_at >= $${paramIndex}`);
        params.push(startDate);
        paramIndex++;
      }
      if (endDate) {
        conditions.push(`al.created_at <= $${paramIndex}`);
        params.push(endDate);
        paramIndex++;
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const result = await query(
        `SELECT
           al.ip_address as "ipAddress",
           COUNT(*) as "attemptCount",
           COUNT(DISTINCT al.user_id) as "uniqueUsers",
           COUNT(DISTINCT (al.metadata->>'identifier')) as "uniqueIdentifiers",
           array_agg(DISTINCT al.event_type) as "eventTypes",
           MIN(al.created_at) as "firstAttempt",
           MAX(al.created_at) as "lastAttempt",
           array_agg(DISTINCT u.email) FILTER (WHERE u.email IS NOT NULL) as "targetEmails"
         FROM auth_logs al
         LEFT JOIN users u ON al.user_id = u.id
         ${whereClause}
         GROUP BY al.ip_address
         HAVING COUNT(*) >= $${paramIndex}
         ORDER BY COUNT(*) DESC
         LIMIT 50`,
        [...params, minAttempts]
      );

      res.json({ summary: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error getting IP summary:', error.message);
      res.status(500).json({ message: 'Failed to get IP summary' });
    }
  }
);

// ============================================================================
// EXPORT ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/auth-logs/export
 * Export authentication logs to CSV
 */
router.get(
  '/auth-logs/export',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT
           al.id,
           al.user_id as user_id,
           u.email,
           u.username,
           al.event_type,
           al.provider,
           al.success,
           al.failure_reason,
           al.ip_address,
           al.user_agent,
           al.metadata,
           al.created_at
         FROM auth_logs al
         LEFT JOIN users u ON al.user_id = u.id
         ORDER BY al.created_at DESC
         LIMIT 10000`
      );

      // Generate CSV
      const headers = ['ID', 'User ID', 'Email', 'Username', 'Event Type', 'Provider', 'Success', 'Failure Reason', 'IP Address', 'User Agent', 'Metadata', 'Created At'];
      const csvRows = [headers.join(',')];

      for (const row of result.rows) {
        const values = [
          row.id,
          row.user_id || '',
          row.email || '',
          row.username || '',
          row.event_type,
          row.provider,
          row.success,
          (row.failure_reason || '').replace(/,/g, ';'),
          row.ip_address || '',
          (row.user_agent || '').replace(/,/g, ';'),
          JSON.stringify(row.metadata || {}).replace(/,/g, ';'),
          row.created_at,
        ];
        csvRows.push(values.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      }

      const csv = csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="auth-logs-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (error: any) {
      console.error('[ADMIN] Error exporting auth logs:', error.message);
      res.status(500).json({ message: 'Failed to export auth logs' });
    }
  }
);

/**
 * GET /api/admin/audit-logs/export
 * Export admin audit logs to CSV
 */
router.get(
  '/audit-logs/export',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT
           al.id,
           al.admin_user_id,
           u.email as admin_email,
           u.username as admin_username,
           al.action,
           al.target_type,
           al.target_id,
           al.previous_value,
           al.new_value,
           al.ip_address,
           al.created_at
         FROM admin_audit_log al
         LEFT JOIN users u ON al.admin_user_id = u.id
         ORDER BY al.created_at DESC
         LIMIT 10000`
      );

      // Generate CSV
      const headers = ['ID', 'Admin ID', 'Admin Email', 'Admin Username', 'Action', 'Target Type', 'Target ID', 'Previous Value', 'New Value', 'IP Address', 'Created At'];
      const csvRows = [headers.join(',')];

      for (const row of result.rows) {
        const values = [
          row.id,
          row.admin_user_id,
          row.admin_email || '',
          row.admin_username || '',
          row.action,
          row.target_type || '',
          row.target_id || '',
          JSON.stringify(row.previous_value || {}).replace(/,/g, ';'),
          JSON.stringify(row.new_value || {}).replace(/,/g, ';'),
          row.ip_address || '',
          row.created_at,
        ];
        csvRows.push(values.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      }

      const csv = csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (error: any) {
      console.error('[ADMIN] Error exporting audit logs:', error.message);
      res.status(500).json({ message: 'Failed to export audit logs' });
    }
  }
);

// ============================================================================
// SECURITY ENDPOINTS (Super Admin Only)
// ============================================================================

/**
 * GET /api/admin/security/locked-accounts
 * Get all currently locked accounts
 */
router.get(
  '/security/locked-accounts',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT
           id,
           email,
           username,
           locked_until as "lockedUntil",
           failed_login_attempts as "failedAttempts"
         FROM users
         WHERE locked_until > NOW()
         ORDER BY locked_until DESC`
      );

      res.json({ accounts: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error getting locked accounts:', error.message);
      res.status(500).json({ message: 'Failed to get locked accounts' });
    }
  }
);

/**
 * GET /api/admin/security/active-sessions
 * Get all active sessions across users
 */
router.get(
  '/security/active-sessions',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT
           s.id,
           s.user_id as "userId",
           u.email,
           u.username,
           s.device_info as "deviceInfo",
           s.ip_address as "ipAddress",
           s.issued_at as "issuedAt",
           s.last_activity_at as "lastActivityAt"
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.revoked = FALSE
           AND s.expires_at > NOW()
         ORDER BY s.last_activity_at DESC NULLS LAST
         LIMIT 100`
      );

      res.json({ sessions: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error getting active sessions:', error.message);
      res.status(500).json({ message: 'Failed to get active sessions' });
    }
  }
);

/**
 * POST /api/admin/security/revoke-all-sessions
 * Revoke all sessions for all users (emergency logout)
 */
router.post(
  '/security/revoke-all-sessions',
  requireAuth,
  requireSuperAdmin,
  logAdminAction('revoke_all_sessions'),
  async (req: Request, res: Response) => {
    try {
      const adminUserId = req.user!.userId;

      const result = await query(
        `UPDATE sessions
         SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $1
         WHERE revoked = FALSE`,
        ['emergency_revocation_by_admin']
      );

      // Log to admin audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          adminUserId,
          'emergency_revoke_all',
          'sessions',
          JSON.stringify({ sessionsRevoked: result.rowCount }),
          req.ip,
        ]
      );

      res.json({
        message: 'All sessions revoked successfully',
        sessionsRevoked: result.rowCount,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error revoking all sessions:', error.message);
      res.status(500).json({ message: 'Failed to revoke sessions' });
    }
  }
);

// ============================================================================
// USER IMPERSONATION ENDPOINTS (Super Admin Only)
// ============================================================================

/**
 * POST /api/admin/impersonate/:userId
 * Start impersonating a user (creates a temporary token)
 */
router.post(
  '/impersonate/:userId',
  requireAuth,
  requireSuperAdmin,
  logAdminAction('impersonate_user'),
  async (req: Request, res: Response) => {
    try {
      const targetUserId = req.params.userId;
      const adminUserId = req.user!.userId;

      // Can't impersonate yourself
      if (targetUserId === adminUserId) {
        res.status(400).json({ message: 'Cannot impersonate yourself' });
        return;
      }

      // Get target user
      const targetUser = await findUserByIdV2(targetUserId);
      if (!targetUser) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      // Can't impersonate other admins or super_admins
      if (targetUser.role === 'admin' || targetUser.role === 'super_admin') {
        res.status(403).json({ message: 'Cannot impersonate admin users' });
        return;
      }

      // Create impersonation token with short expiry (1 hour)
      // Use jwt directly for custom expiry
      const jwt = await import('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

      const impersonationToken = jwt.default.sign(
        {
          userId: targetUser.id,
          email: targetUser.email,
          username: targetUser.username || '',
          tier: targetUser.tier || 'basic',
          provider: targetUser.provider || 'password',
          role: targetUser.role || 'user',
          type: 'access',
          impersonatedBy: adminUserId, // Track who initiated impersonation
        },
        JWT_SECRET,
        {
          expiresIn: '1h', // Short expiry for impersonation
          issuer: 'tiphub-auth',
          audience: 'tiphub-api',
        }
      );

      // Log to admin audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          adminUserId,
          'impersonate_user',
          'user',
          targetUserId,
          JSON.stringify({ targetEmail: targetUser.email, targetRole: targetUser.role }),
          req.ip,
        ]
      );

      // Log to auth_logs as well for security audit
      await query(
        `INSERT INTO auth_logs (user_id, event_type, provider, success, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          targetUserId,
          'impersonation_start',
          'admin',
          true,
          req.ip,
          req.headers['user-agent'] || null,
        ]
      );

      res.json({
        message: 'Impersonation started',
        impersonationToken,
        targetUser: {
          id: targetUser.id,
          email: targetUser.email,
          username: targetUser.username,
          name: targetUser.name,
          role: targetUser.role,
          tier: targetUser.tier,
        },
        expiresIn: 3600, // 1 hour in seconds
      });
    } catch (error: any) {
      console.error('[ADMIN] Error starting impersonation:', error.message);
      res.status(500).json({ message: 'Failed to start impersonation' });
    }
  }
);

/**
 * POST /api/admin/impersonate/end
 * End impersonation session (audit log only, token invalidation handled client-side)
 */
router.post(
  '/impersonate/end',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { adminUserId, targetUserId } = req.body;

      // Log impersonation end to audit log
      if (adminUserId && targetUserId) {
        await query(
          `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [adminUserId, 'impersonation_end', 'user', targetUserId, req.ip]
        );

        await query(
          `INSERT INTO auth_logs (user_id, event_type, provider, success, ip_address)
           VALUES ($1, $2, $3, $4, $5)`,
          [targetUserId, 'impersonation_end', 'admin', true, req.ip]
        );
      }

      res.json({ message: 'Impersonation ended' });
    } catch (error: any) {
      console.error('[ADMIN] Error ending impersonation:', error.message);
      res.status(500).json({ message: 'Failed to end impersonation' });
    }
  }
);

// ============================================================================
// RATE LIMIT MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/rate-limits
 * Get all rate limit configurations
 */
router.get(
  '/rate-limits',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(`
        SELECT
          id,
          endpoint_key as "endpointKey",
          tier,
          window_ms as "windowMs",
          max_requests as "maxRequests",
          description,
          is_active as "isActive",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM rate_limit_configs
        ORDER BY endpoint_key, tier
      `);

      res.json({ configs: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error getting rate limits:', error.message);
      res.status(500).json({ message: 'Failed to get rate limits' });
    }
  }
);

/**
 * GET /api/admin/rate-limits/:id
 * Get a single rate limit configuration
 */
router.get(
  '/rate-limits/:id(\\d+)',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await queryOne<any>(
        `SELECT
          id,
          endpoint_key as "endpointKey",
          tier,
          window_ms as "windowMs",
          max_requests as "maxRequests",
          description,
          is_active as "isActive",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM rate_limit_configs
        WHERE id = $1`,
        [req.params.id]
      );

      if (!result) {
        res.status(404).json({ message: 'Rate limit config not found' });
        return;
      }

      res.json({ config: result });
    } catch (error: any) {
      console.error('[ADMIN] Error getting rate limit:', error.message);
      res.status(500).json({ message: 'Failed to get rate limit' });
    }
  }
);

/**
 * POST /api/admin/rate-limits
 * Create a new rate limit configuration
 */
router.post(
  '/rate-limits',
  requireAuth,
  requireAdmin,
  logAdminAction('create_rate_limit'),
  async (req: Request, res: Response) => {
    try {
      const { endpointKey, tier, windowMs, maxRequests, description } = req.body;

      if (!endpointKey || !windowMs || !maxRequests) {
        res.status(400).json({ message: 'endpointKey, windowMs, and maxRequests are required' });
        return;
      }

      if (!['all', 'basic', 'premium', 'admin'].includes(tier || 'all')) {
        res.status(400).json({ message: 'Invalid tier' });
        return;
      }

      const result = await queryOne<{ id: string }>(
        `INSERT INTO rate_limit_configs (endpoint_key, tier, window_ms, max_requests, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [endpointKey, tier || 'all', windowMs, maxRequests, description || null]
      );

      res.status(201).json({
        message: 'Rate limit config created successfully',
        id: result?.id,
      });
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(400).json({ message: 'Rate limit config already exists for this endpoint and tier' });
        return;
      }
      console.error('[ADMIN] Error creating rate limit:', error.message);
      res.status(500).json({ message: 'Failed to create rate limit' });
    }
  }
);

/**
 * PUT /api/admin/rate-limits/:id
 * Update a rate limit configuration
 */
router.put(
  '/rate-limits/:id(\\d+)',
  requireAuth,
  requireAdmin,
  logAdminAction('update_rate_limit'),
  async (req: Request, res: Response) => {
    try {
      const { windowMs, maxRequests, description, isActive } = req.body;
      const adminUserId = req.user!.userId;

      // Get old value for audit
      const oldConfig = await queryOne<any>(
        'SELECT * FROM rate_limit_configs WHERE id = $1',
        [req.params.id]
      );

      if (!oldConfig) {
        res.status(404).json({ message: 'Rate limit config not found' });
        return;
      }

      await query(
        `UPDATE rate_limit_configs
         SET window_ms = COALESCE($1, window_ms),
             max_requests = COALESCE($2, max_requests),
             description = COALESCE($3, description),
             is_active = COALESCE($4, is_active)
         WHERE id = $5`,
        [windowMs, maxRequests, description, isActive, req.params.id]
      );

      // Log to admin audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, previous_value, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminUserId,
          'update_rate_limit',
          'rate_limit_config',
          req.params.id,
          JSON.stringify({
            windowMs: oldConfig.window_ms,
            maxRequests: oldConfig.max_requests,
            isActive: oldConfig.is_active,
          }),
          JSON.stringify({ windowMs, maxRequests, isActive }),
          req.ip,
        ]
      );

      // Broadcast rate limit change to all users (they'll refetch limits)
      notifyRateLimitChange(oldConfig.endpoint);

      res.json({ message: 'Rate limit config updated successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error updating rate limit:', error.message);
      res.status(500).json({ message: 'Failed to update rate limit' });
    }
  }
);

/**
 * DELETE /api/admin/rate-limits/:id
 * Delete a rate limit configuration
 */
router.delete(
  '/rate-limits/:id(\\d+)',
  requireAuth,
  requireAdmin,
  logAdminAction('delete_rate_limit'),
  async (req: Request, res: Response) => {
    try {
      await query('DELETE FROM rate_limit_configs WHERE id = $1', [req.params.id]);
      res.json({ message: 'Rate limit config deleted successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error deleting rate limit:', error.message);
      res.status(500).json({ message: 'Failed to delete rate limit' });
    }
  }
);

// ============================================================================
// USER-SPECIFIC RATE LIMIT OVERRIDES
// ============================================================================

/**
 * GET /api/admin/rate-limits/overrides
 * Get all user-specific rate limit overrides
 */
router.get(
  '/rate-limits/overrides',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(`
        SELECT
          rlo.id,
          rlo.user_id as "userId",
          u.email as "userEmail",
          u.username as "userName",
          rlo.endpoint_key as "endpointKey",
          rlo.window_ms as "windowMs",
          rlo.max_requests as "maxRequests",
          rlo.reason,
          rlo.expires_at as "expiresAt",
          rlo.created_by as "createdBy",
          creator.email as "createdByEmail",
          rlo.created_at as "createdAt"
        FROM rate_limit_overrides rlo
        JOIN users u ON rlo.user_id = u.id
        LEFT JOIN users creator ON rlo.created_by = creator.id
        ORDER BY rlo.created_at DESC
      `);

      res.json({ overrides: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error getting rate limit overrides:', error.message);
      res.status(500).json({ message: 'Failed to get rate limit overrides' });
    }
  }
);

/**
 * GET /api/admin/rate-limits/overrides/user/:userId
 * Get rate limit overrides for a specific user
 */
router.get(
  '/rate-limits/overrides/user/:userId',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT
          id,
          endpoint_key as "endpointKey",
          window_ms as "windowMs",
          max_requests as "maxRequests",
          reason,
          expires_at as "expiresAt",
          created_at as "createdAt"
        FROM rate_limit_overrides
        WHERE user_id = $1
        ORDER BY endpoint_key`,
        [req.params.userId]
      );

      res.json({ overrides: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error getting user rate limit overrides:', error.message);
      res.status(500).json({ message: 'Failed to get user rate limit overrides' });
    }
  }
);

/**
 * POST /api/admin/rate-limits/overrides
 * Create a user-specific rate limit override
 */
router.post(
  '/rate-limits/overrides',
  requireAuth,
  requireAdmin,
  logAdminAction('create_rate_limit_override'),
  async (req: Request, res: Response) => {
    try {
      const { userId, endpointKey, windowMs, maxRequests, reason, expiresAt } = req.body;
      const adminUserId = req.user!.userId;

      if (!userId || !endpointKey || !windowMs || !maxRequests) {
        res.status(400).json({ message: 'userId, endpointKey, windowMs, and maxRequests are required' });
        return;
      }

      // Verify user exists
      const user = await findUserByIdV2(userId);
      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      const result = await queryOne<{ id: string }>(
        `INSERT INTO rate_limit_overrides (user_id, endpoint_key, window_ms, max_requests, reason, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [userId, endpointKey, windowMs, maxRequests, reason || null, expiresAt || null, adminUserId]
      );

      // Log to admin audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          adminUserId,
          'create_rate_limit_override',
          'user',
          userId,
          JSON.stringify({ endpointKey, windowMs, maxRequests, reason }),
          req.ip,
        ]
      );

      // Notify the specific user about their rate limit override
      notifyRateLimitOverride(userId, endpointKey);

      res.status(201).json({
        message: 'Rate limit override created successfully',
        id: result?.id,
      });
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(400).json({ message: 'Override already exists for this user and endpoint' });
        return;
      }
      console.error('[ADMIN] Error creating rate limit override:', error.message);
      res.status(500).json({ message: 'Failed to create rate limit override' });
    }
  }
);

/**
 * DELETE /api/admin/rate-limits/overrides/:id
 * Delete a user-specific rate limit override
 */
router.delete(
  '/rate-limits/overrides/:id',
  requireAuth,
  requireAdmin,
  logAdminAction('delete_rate_limit_override'),
  async (req: Request, res: Response) => {
    try {
      await query('DELETE FROM rate_limit_overrides WHERE id = $1', [req.params.id]);
      res.json({ message: 'Rate limit override deleted successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error deleting rate limit override:', error.message);
      res.status(500).json({ message: 'Failed to delete rate limit override' });
    }
  }
);

// ============================================================================
// RATE LIMIT VIOLATIONS & MONITORING
// ============================================================================

/**
 * GET /api/admin/rate-limits/violations
 * Get recent rate limit violations
 */
router.get(
  '/rate-limits/violations',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = (page - 1) * limit;
      const endpointKey = req.query.endpointKey as string | undefined;
      const userId = req.query.userId as string | undefined;

      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (endpointKey) {
        conditions.push(`rlv.endpoint_key = $${paramIndex}`);
        params.push(endpointKey);
        paramIndex++;
      }

      if (userId) {
        conditions.push(`rlv.user_id = $${paramIndex}`);
        params.push(userId);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM rate_limit_violations rlv ${whereClause}`,
        params
      );
      const total = parseInt(countResult?.count || '0');

      const result = await query(
        `SELECT
          rlv.id,
          rlv.user_id as "userId",
          u.email as "userEmail",
          rlv.ip_address as "ipAddress",
          rlv.endpoint_key as "endpointKey",
          rlv.endpoint_path as "endpointPath",
          rlv.request_count as "requestCount",
          rlv.limit_max as "limitMax",
          rlv.window_ms as "windowMs",
          rlv.created_at as "createdAt"
        FROM rate_limit_violations rlv
        LEFT JOIN users u ON rlv.user_id = u.id
        ${whereClause}
        ORDER BY rlv.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      res.json({
        violations: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting rate limit violations:', error.message);
      res.status(500).json({ message: 'Failed to get rate limit violations' });
    }
  }
);

/**
 * GET /api/admin/rate-limits/violations/stats
 * Get rate limit violation statistics
 */
router.get(
  '/rate-limits/violations/stats',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      // Total violations in last 24 hours
      const last24hResult = await queryOne<{ count: string }>(`
        SELECT COUNT(*) as count
        FROM rate_limit_violations
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);

      // Violations by endpoint
      const byEndpointResult = await query(`
        SELECT
          endpoint_key as "endpointKey",
          COUNT(*) as count
        FROM rate_limit_violations
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY endpoint_key
        ORDER BY count DESC
        LIMIT 10
      `);

      // Top violating IPs
      const byIpResult = await query(`
        SELECT
          ip_address as "ipAddress",
          COUNT(*) as count
        FROM rate_limit_violations
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY ip_address
        ORDER BY count DESC
        LIMIT 10
      `);

      // Top violating users
      const byUserResult = await query(`
        SELECT
          rlv.user_id as "userId",
          u.email as "userEmail",
          COUNT(*) as count
        FROM rate_limit_violations rlv
        JOIN users u ON rlv.user_id = u.id
        WHERE rlv.created_at >= NOW() - INTERVAL '24 hours'
          AND rlv.user_id IS NOT NULL
        GROUP BY rlv.user_id, u.email
        ORDER BY count DESC
        LIMIT 10
      `);

      // Hourly trend
      const hourlyResult = await query(`
        SELECT
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as count
        FROM rate_limit_violations
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour ASC
      `);

      res.json({
        totalLast24h: parseInt(last24hResult?.count || '0'),
        byEndpoint: byEndpointResult.rows,
        byIp: byIpResult.rows,
        byUser: byUserResult.rows,
        hourlyTrend: hourlyResult.rows.map((row: any) => ({
          hour: row.hour,
          count: parseInt(row.count),
        })),
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting violation stats:', error.message);
      res.status(500).json({ message: 'Failed to get violation stats' });
    }
  }
);

/**
 * POST /api/admin/rate-limits/cleanup
 * Cleanup old rate limit usage data
 */
router.post(
  '/rate-limits/cleanup',
  requireAuth,
  requireSuperAdmin,
  logAdminAction('cleanup_rate_limit_data'),
  async (req: Request, res: Response) => {
    try {
      // Cleanup usage data older than 1 hour
      const usageResult = await query(`
        DELETE FROM rate_limit_usage
        WHERE window_end < NOW() - INTERVAL '1 hour'
      `);

      // Optionally cleanup violations older than retention period
      const retentionDays = parseInt(req.body.retentionDays as string) || 30;
      const violationsResult = await query(`
        DELETE FROM rate_limit_violations
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
      `);

      // Cleanup expired overrides
      const overridesResult = await query(`
        DELETE FROM rate_limit_overrides
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
      `);

      res.json({
        message: 'Cleanup completed',
        usageDeleted: usageResult.rowCount,
        violationsDeleted: violationsResult.rowCount,
        expiredOverridesDeleted: overridesResult.rowCount,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error cleaning up rate limit data:', error.message);
      res.status(500).json({ message: 'Failed to cleanup rate limit data' });
    }
  }
);

// ============================================================================
// FEATURE FLAGS MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/feature-flags
 * Get all feature flags
 */
router.get(
  '/feature-flags',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;

      let sql = `
        SELECT
          id,
          key,
          name,
          description,
          is_enabled as "isEnabled",
          target_tiers as "targetTiers",
          target_roles as "targetRoles",
          rollout_percentage as "rolloutPercentage",
          starts_at as "startsAt",
          expires_at as "expiresAt",
          category,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM feature_flags
      `;

      const params: any[] = [];
      if (category) {
        sql += ' WHERE category = $1';
        params.push(category);
      }

      sql += ' ORDER BY category, name';

      const result = await query(sql, params);
      res.json({ flags: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error getting feature flags:', error.message);
      res.status(500).json({ message: 'Failed to get feature flags' });
    }
  }
);

/**
 * GET /api/admin/feature-flags/:id
 * Get a single feature flag with overrides count
 */
router.get(
  '/feature-flags/:id',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const flag = await queryOne<any>(
        `SELECT
          ff.id,
          ff.key,
          ff.name,
          ff.description,
          ff.is_enabled as "isEnabled",
          ff.target_tiers as "targetTiers",
          ff.target_roles as "targetRoles",
          ff.rollout_percentage as "rolloutPercentage",
          ff.starts_at as "startsAt",
          ff.expires_at as "expiresAt",
          ff.category,
          ff.created_at as "createdAt",
          ff.updated_at as "updatedAt",
          (SELECT COUNT(*) FROM feature_flag_overrides WHERE flag_id = ff.id) as "overridesCount"
        FROM feature_flags ff
        WHERE ff.id = $1`,
        [req.params.id]
      );

      if (!flag) {
        res.status(404).json({ message: 'Feature flag not found' });
        return;
      }

      res.json({ flag });
    } catch (error: any) {
      console.error('[ADMIN] Error getting feature flag:', error.message);
      res.status(500).json({ message: 'Failed to get feature flag' });
    }
  }
);

/**
 * POST /api/admin/feature-flags
 * Create a new feature flag
 */
router.post(
  '/feature-flags',
  requireAuth,
  requireAdmin,
  logAdminAction('create_feature_flag'),
  async (req: Request, res: Response) => {
    try {
      const {
        key,
        name,
        description,
        isEnabled,
        targetTiers,
        targetRoles,
        rolloutPercentage,
        startsAt,
        expiresAt,
        category,
      } = req.body;
      const adminUserId = req.user!.userId;

      if (!key || !name) {
        res.status(400).json({ message: 'key and name are required' });
        return;
      }

      const result = await queryOne<{ id: string }>(
        `INSERT INTO feature_flags
          (key, name, description, is_enabled, target_tiers, target_roles, rollout_percentage, starts_at, expires_at, category, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          key,
          name,
          description || null,
          isEnabled ?? false,
          targetTiers || null,
          targetRoles || null,
          rolloutPercentage ?? 100,
          startsAt || null,
          expiresAt || null,
          category || 'general',
          adminUserId,
        ]
      );

      // Log to audit
      await query(
        `INSERT INTO feature_flag_audit (flag_id, admin_id, action, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          result?.id,
          adminUserId,
          'create',
          JSON.stringify({ key, name, isEnabled, category }),
          req.ip,
        ]
      );

      res.status(201).json({
        message: 'Feature flag created successfully',
        id: result?.id,
      });
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(400).json({ message: 'Feature flag with this key already exists' });
        return;
      }
      console.error('[ADMIN] Error creating feature flag:', error.message);
      res.status(500).json({ message: 'Failed to create feature flag' });
    }
  }
);

/**
 * PUT /api/admin/feature-flags/:id
 * Update a feature flag
 */
router.put(
  '/feature-flags/:id',
  requireAuth,
  requireAdmin,
  logAdminAction('update_feature_flag'),
  async (req: Request, res: Response) => {
    try {
      const {
        name,
        description,
        isEnabled,
        targetTiers,
        targetRoles,
        rolloutPercentage,
        startsAt,
        expiresAt,
        category,
      } = req.body;
      const adminUserId = req.user!.userId;

      // Get old value for audit
      const oldFlag = await queryOne<any>(
        'SELECT * FROM feature_flags WHERE id = $1',
        [req.params.id]
      );

      if (!oldFlag) {
        res.status(404).json({ message: 'Feature flag not found' });
        return;
      }

      await query(
        `UPDATE feature_flags
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             is_enabled = COALESCE($3, is_enabled),
             target_tiers = $4,
             target_roles = $5,
             rollout_percentage = COALESCE($6, rollout_percentage),
             starts_at = $7,
             expires_at = $8,
             category = COALESCE($9, category)
         WHERE id = $10`,
        [
          name,
          description,
          isEnabled,
          targetTiers !== undefined ? targetTiers : oldFlag.target_tiers,
          targetRoles !== undefined ? targetRoles : oldFlag.target_roles,
          rolloutPercentage,
          startsAt !== undefined ? startsAt : oldFlag.starts_at,
          expiresAt !== undefined ? expiresAt : oldFlag.expires_at,
          category,
          req.params.id,
        ]
      );

      // Log to audit
      await query(
        `INSERT INTO feature_flag_audit (flag_id, admin_id, action, old_value, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.params.id,
          adminUserId,
          'update',
          JSON.stringify({
            isEnabled: oldFlag.is_enabled,
            rolloutPercentage: oldFlag.rollout_percentage,
          }),
          JSON.stringify({ isEnabled, rolloutPercentage }),
          req.ip,
        ]
      );

      // Broadcast feature flag change to all users (they'll refetch flags)
      notifyFeatureFlagChange(oldFlag.key, isEnabled ?? oldFlag.is_enabled);

      res.json({ message: 'Feature flag updated successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error updating feature flag:', error.message);
      res.status(500).json({ message: 'Failed to update feature flag' });
    }
  }
);

/**
 * PUT /api/admin/feature-flags/:id/toggle
 * Quick toggle for enabling/disabling a feature flag
 */
router.put(
  '/feature-flags/:id/toggle',
  requireAuth,
  requireAdmin,
  logAdminAction('toggle_feature_flag'),
  async (req: Request, res: Response) => {
    try {
      const adminUserId = req.user!.userId;

      const flag = await queryOne<any>(
        'SELECT id, key, is_enabled FROM feature_flags WHERE id = $1',
        [req.params.id]
      );

      if (!flag) {
        res.status(404).json({ message: 'Feature flag not found' });
        return;
      }

      const newEnabled = !flag.is_enabled;

      await query(
        'UPDATE feature_flags SET is_enabled = $1 WHERE id = $2',
        [newEnabled, req.params.id]
      );

      // Log to audit
      await query(
        `INSERT INTO feature_flag_audit (flag_id, admin_id, action, old_value, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.params.id,
          adminUserId,
          'toggle',
          JSON.stringify({ isEnabled: flag.is_enabled }),
          JSON.stringify({ isEnabled: newEnabled }),
          req.ip,
        ]
      );

      // Broadcast feature flag change to all users
      notifyFeatureFlagChange(flag.key, newEnabled);

      res.json({
        message: `Feature flag ${newEnabled ? 'enabled' : 'disabled'}`,
        isEnabled: newEnabled,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error toggling feature flag:', error.message);
      res.status(500).json({ message: 'Failed to toggle feature flag' });
    }
  }
);

/**
 * DELETE /api/admin/feature-flags/:id
 * Delete a feature flag
 */
router.delete(
  '/feature-flags/:id',
  requireAuth,
  requireSuperAdmin,
  logAdminAction('delete_feature_flag'),
  async (req: Request, res: Response) => {
    try {
      await query('DELETE FROM feature_flags WHERE id = $1', [req.params.id]);
      res.json({ message: 'Feature flag deleted successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error deleting feature flag:', error.message);
      res.status(500).json({ message: 'Failed to delete feature flag' });
    }
  }
);

// ============================================================================
// FEATURE FLAG OVERRIDES
// ============================================================================

/**
 * GET /api/admin/feature-flags/:id/overrides
 * Get overrides for a specific flag
 */
router.get(
  '/feature-flags/:id/overrides',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT
          ffo.id,
          ffo.flag_id as "flagId",
          ffo.user_id as "userId",
          u.email as "userEmail",
          u.username as "userName",
          ffo.is_enabled as "isEnabled",
          ffo.reason,
          ffo.expires_at as "expiresAt",
          creator.email as "createdByEmail",
          ffo.created_at as "createdAt"
        FROM feature_flag_overrides ffo
        JOIN users u ON ffo.user_id = u.id
        LEFT JOIN users creator ON ffo.created_by = creator.id
        WHERE ffo.flag_id = $1
        ORDER BY ffo.created_at DESC`,
        [req.params.id]
      );

      res.json({ overrides: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error getting flag overrides:', error.message);
      res.status(500).json({ message: 'Failed to get flag overrides' });
    }
  }
);

/**
 * POST /api/admin/feature-flags/:id/overrides
 * Add an override for a specific flag
 */
router.post(
  '/feature-flags/:id/overrides',
  requireAuth,
  requireAdmin,
  logAdminAction('create_flag_override'),
  async (req: Request, res: Response) => {
    try {
      const { userId, isEnabled, reason, expiresAt } = req.body;
      const adminUserId = req.user!.userId;

      if (!userId || isEnabled === undefined) {
        res.status(400).json({ message: 'userId and isEnabled are required' });
        return;
      }

      // Verify flag exists
      const flag = await queryOne<{ id: number; key: string }>(
        'SELECT id, key FROM feature_flags WHERE id = $1',
        [req.params.id]
      );

      if (!flag) {
        res.status(404).json({ message: 'Feature flag not found' });
        return;
      }

      // Verify user exists
      const user = await findUserByIdV2(userId);
      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      const result = await queryOne<{ id: string }>(
        `INSERT INTO feature_flag_overrides (flag_id, user_id, is_enabled, reason, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [req.params.id, userId, isEnabled, reason || null, expiresAt || null, adminUserId]
      );

      // Notify the specific user about their feature flag override
      notifyFeatureFlagOverride(userId, flag.key, isEnabled);

      res.status(201).json({
        message: 'Override created successfully',
        id: result?.id,
      });
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(400).json({ message: 'Override already exists for this user' });
        return;
      }
      console.error('[ADMIN] Error creating flag override:', error.message);
      res.status(500).json({ message: 'Failed to create flag override' });
    }
  }
);

/**
 * DELETE /api/admin/feature-flags/overrides/:overrideId
 * Delete a flag override
 */
router.delete(
  '/feature-flags/overrides/:overrideId',
  requireAuth,
  requireAdmin,
  logAdminAction('delete_flag_override'),
  async (req: Request, res: Response) => {
    try {
      await query('DELETE FROM feature_flag_overrides WHERE id = $1', [req.params.overrideId]);
      res.json({ message: 'Override deleted successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error deleting flag override:', error.message);
      res.status(500).json({ message: 'Failed to delete flag override' });
    }
  }
);

/**
 * GET /api/admin/feature-flags/audit/:id
 * Get audit log for a feature flag
 */
router.get(
  '/feature-flags/audit/:id',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT
          ffa.id,
          ffa.action,
          ffa.old_value as "oldValue",
          ffa.new_value as "newValue",
          ffa.ip_address as "ipAddress",
          ffa.created_at as "createdAt",
          u.email as "adminEmail"
        FROM feature_flag_audit ffa
        LEFT JOIN users u ON ffa.admin_id = u.id
        WHERE ffa.flag_id = $1
        ORDER BY ffa.created_at DESC
        LIMIT 50`,
        [req.params.id]
      );

      res.json({ audit: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error getting flag audit:', error.message);
      res.status(500).json({ message: 'Failed to get flag audit' });
    }
  }
);

/**
 * GET /api/admin/feature-flags/categories
 * Get list of categories
 */
router.get(
  '/feature-flags/categories',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(`
        SELECT DISTINCT category, COUNT(*) as count
        FROM feature_flags
        GROUP BY category
        ORDER BY category
      `);

      res.json({
        categories: result.rows.map((r: any) => ({
          name: r.category,
          count: parseInt(r.count),
        })),
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting categories:', error.message);
      res.status(500).json({ message: 'Failed to get categories' });
    }
  }
);

// ============================================================================
// ADMIN EMAIL NOTIFICATIONS
// ============================================================================

/**
 * GET /api/admin/notifications/event-types
 * Get all notification event types
 */
router.get(
  '/notifications/event-types',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(`
        SELECT
          id,
          key,
          name,
          description,
          category,
          default_enabled as "defaultEnabled",
          severity,
          created_at as "createdAt"
        FROM notification_event_types
        ORDER BY category, name
      `);

      res.json({ eventTypes: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error getting notification event types:', error.message);
      res.status(500).json({ message: 'Failed to get notification event types' });
    }
  }
);

/**
 * GET /api/admin/notifications/preferences
 * Get notification preferences for the current admin
 */
router.get(
  '/notifications/preferences',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Get all event types with user's preferences (if any)
      const result = await query(`
        SELECT
          net.id as "eventTypeId",
          net.key,
          net.name,
          net.description,
          net.category,
          net.default_enabled as "defaultEnabled",
          net.severity,
          COALESCE(anp.email_enabled, net.default_enabled) as "emailEnabled",
          COALESCE(anp.push_enabled, false) as "pushEnabled",
          anp.id as "preferenceId"
        FROM notification_event_types net
        LEFT JOIN admin_notification_preferences anp
          ON net.id = anp.event_type_id AND anp.admin_id = $1
        ORDER BY net.category, net.name
      `, [userId]);

      res.json({ preferences: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error getting notification preferences:', error.message);
      res.status(500).json({ message: 'Failed to get notification preferences' });
    }
  }
);

/**
 * PUT /api/admin/notifications/preferences
 * Update notification preferences for the current admin
 */
router.put(
  '/notifications/preferences',
  requireAuth,
  requireAdmin,
  logAdminAction('update_notification_preferences'),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { preferences } = req.body;
      if (!Array.isArray(preferences)) {
        return res.status(400).json({ message: 'Preferences must be an array' });
      }

      // Update each preference
      for (const pref of preferences) {
        const { eventTypeId, emailEnabled, pushEnabled } = pref;

        await query(`
          INSERT INTO admin_notification_preferences
            (admin_id, event_type_id, email_enabled, push_enabled)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (admin_id, event_type_id)
          DO UPDATE SET
            email_enabled = EXCLUDED.email_enabled,
            push_enabled = EXCLUDED.push_enabled,
            updated_at = NOW()
        `, [userId, eventTypeId, emailEnabled ?? true, pushEnabled ?? false]);
      }

      res.json({ message: 'Preferences updated successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error updating notification preferences:', error.message);
      res.status(500).json({ message: 'Failed to update notification preferences' });
    }
  }
);

/**
 * GET /api/admin/notifications/settings
 * Get global notification settings (super_admin only)
 */
router.get(
  '/notifications/settings',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(`
        SELECT key, value, description, updated_at as "updatedAt"
        FROM notification_settings
        ORDER BY key
      `);

      // Convert to object for easier consumption
      const settings: Record<string, { value: string | null; description: string | null }> = {};
      for (const row of result.rows) {
        settings[row.key] = {
          value: row.key === 'smtp_password' ? (row.value ? '********' : null) : row.value,
          description: row.description,
        };
      }

      res.json({ settings });
    } catch (error: any) {
      console.error('[ADMIN] Error getting notification settings:', error.message);
      res.status(500).json({ message: 'Failed to get notification settings' });
    }
  }
);

/**
 * PUT /api/admin/notifications/settings
 * Update global notification settings (super_admin only)
 */
router.put(
  '/notifications/settings',
  requireAuth,
  requireSuperAdmin,
  logAdminAction('update_notification_settings'),
  async (req: Request, res: Response) => {
    try {
      const { settings } = req.body;
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ message: 'Settings must be an object' });
      }

      for (const [key, value] of Object.entries(settings)) {
        // Skip password if it's the masked value
        if (key === 'smtp_password' && value === '********') {
          continue;
        }

        await query(`
          UPDATE notification_settings
          SET value = $1, updated_at = NOW()
          WHERE key = $2
        `, [value, key]);
      }

      res.json({ message: 'Settings updated successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error updating notification settings:', error.message);
      res.status(500).json({ message: 'Failed to update notification settings' });
    }
  }
);

/**
 * POST /api/admin/notifications/test
 * Send a test notification email (super_admin only)
 */
router.post(
  '/notifications/test',
  requireAuth,
  requireSuperAdmin,
  logAdminAction('send_test_notification'),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const userEmail = (req as any).user?.email;

      if (!userEmail) {
        return res.status(400).json({ message: 'User email not found' });
      }

      // Check if notifications are enabled
      const enabledResult = await query(
        `SELECT value FROM notification_settings WHERE key = 'enabled'`
      );
      const enabled = enabledResult.rows[0]?.value === 'true';

      if (!enabled) {
        return res.status(400).json({
          message: 'Email notifications are disabled. Enable them in settings first.'
        });
      }

      // Queue a test notification
      await query(`
        INSERT INTO notification_queue (
          event_type_key,
          recipient_admin_id,
          recipient_email,
          subject,
          body_text,
          metadata,
          status
        ) VALUES (
          'system.test',
          $1,
          $2,
          '[Tiphub] Test Notification',
          'This is a test notification from Tiphub Admin Panel.

If you received this email, your notification settings are configured correctly.

Time: ' || NOW()::text,
          '{"test": true}'::jsonb,
          'pending'
        )
      `, [userId, userEmail]);

      res.json({ message: 'Test notification queued successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error sending test notification:', error.message);
      res.status(500).json({ message: 'Failed to send test notification' });
    }
  }
);

/**
 * GET /api/admin/notifications/queue
 * Get notification queue status
 */
router.get(
  '/notifications/queue',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { status, limit = '50' } = req.query;

      let whereClause = '';
      const params: any[] = [];

      if (status && typeof status === 'string') {
        params.push(status);
        whereClause = `WHERE status = $${params.length}`;
      }

      const result = await query(`
        SELECT
          nq.id,
          nq.event_type_key as "eventTypeKey",
          nq.recipient_email as "recipientEmail",
          nq.subject,
          nq.status,
          nq.attempts,
          nq.max_attempts as "maxAttempts",
          nq.last_error as "lastError",
          nq.scheduled_at as "scheduledAt",
          nq.sent_at as "sentAt",
          nq.created_at as "createdAt"
        FROM notification_queue nq
        ${whereClause}
        ORDER BY nq.created_at DESC
        LIMIT $${params.length + 1}
      `, [...params, parseInt(limit as string)]);

      // Get stats
      const statsResult = await query(`
        SELECT
          status,
          COUNT(*) as count
        FROM notification_queue
        GROUP BY status
      `);

      const stats: Record<string, number> = {};
      for (const row of statsResult.rows) {
        stats[row.status] = parseInt(row.count);
      }

      res.json({ queue: result.rows, stats });
    } catch (error: any) {
      console.error('[ADMIN] Error getting notification queue:', error.message);
      res.status(500).json({ message: 'Failed to get notification queue' });
    }
  }
);

/**
 * GET /api/admin/notifications/history
 * Get notification history
 */
router.get(
  '/notifications/history',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { page = '1', limit = '20', eventType } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      let whereClause = '';
      const params: any[] = [];

      if (eventType && typeof eventType === 'string') {
        params.push(eventType);
        whereClause = `WHERE event_type_key = $${params.length}`;
      }

      const result = await query(`
        SELECT
          nh.id,
          nh.event_type_key as "eventTypeKey",
          nh.recipient_email as "recipientEmail",
          nh.subject,
          nh.status,
          nh.error_message as "errorMessage",
          nh.sent_at as "sentAt",
          net.name as "eventTypeName"
        FROM notification_history nh
        LEFT JOIN notification_event_types net ON nh.event_type_key = net.key
        ${whereClause}
        ORDER BY nh.sent_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, parseInt(limit as string), offset]);

      // Get total count
      const countResult = await query(`
        SELECT COUNT(*) as total
        FROM notification_history
        ${whereClause}
      `, params);

      res.json({
        history: result.rows,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: parseInt(countResult.rows[0].total),
        },
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting notification history:', error.message);
      res.status(500).json({ message: 'Failed to get notification history' });
    }
  }
);

/**
 * POST /api/admin/notifications/queue/:id/retry
 * Retry a failed notification
 */
router.post(
  '/notifications/queue/:id/retry',
  requireAuth,
  requireAdmin,
  logAdminAction('retry_notification'),
  async (req: Request, res: Response) => {
    try {
      await query(`
        UPDATE notification_queue
        SET
          status = 'pending',
          attempts = 0,
          last_error = NULL,
          scheduled_at = NOW()
        WHERE id = $1 AND status IN ('failed', 'cancelled')
      `, [req.params.id]);

      res.json({ message: 'Notification queued for retry' });
    } catch (error: any) {
      console.error('[ADMIN] Error retrying notification:', error.message);
      res.status(500).json({ message: 'Failed to retry notification' });
    }
  }
);

/**
 * DELETE /api/admin/notifications/queue/:id
 * Cancel/delete a pending notification
 */
router.delete(
  '/notifications/queue/:id',
  requireAuth,
  requireAdmin,
  logAdminAction('cancel_notification'),
  async (req: Request, res: Response) => {
    try {
      await query(`
        UPDATE notification_queue
        SET status = 'cancelled'
        WHERE id = $1 AND status = 'pending'
      `, [req.params.id]);

      res.json({ message: 'Notification cancelled' });
    } catch (error: any) {
      console.error('[ADMIN] Error cancelling notification:', error.message);
      res.status(500).json({ message: 'Failed to cancel notification' });
    }
  }
);

/**
 * GET /api/admin/notifications/templates
 * Get email templates
 */
router.get(
  '/notifications/templates',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await query(`
        SELECT
          et.id,
          et.event_type_key as "eventTypeKey",
          et.subject_template as "subjectTemplate",
          et.body_text_template as "bodyTextTemplate",
          et.body_html_template as "bodyHtmlTemplate",
          et.variables,
          et.created_at as "createdAt",
          et.updated_at as "updatedAt",
          net.name as "eventTypeName"
        FROM email_templates et
        LEFT JOIN notification_event_types net ON et.event_type_key = net.key
        ORDER BY net.category, net.name
      `);

      res.json({ templates: result.rows });
    } catch (error: any) {
      console.error('[ADMIN] Error getting email templates:', error.message);
      res.status(500).json({ message: 'Failed to get email templates' });
    }
  }
);

/**
 * PUT /api/admin/notifications/templates/:eventTypeKey
 * Update an email template (super_admin only)
 */
router.put(
  '/notifications/templates/:eventTypeKey',
  requireAuth,
  requireSuperAdmin,
  logAdminAction('update_email_template'),
  async (req: Request, res: Response) => {
    try {
      const { subjectTemplate, bodyTextTemplate, bodyHtmlTemplate } = req.body;

      await query(`
        UPDATE email_templates
        SET
          subject_template = COALESCE($1, subject_template),
          body_text_template = COALESCE($2, body_text_template),
          body_html_template = $3,
          updated_at = NOW()
        WHERE event_type_key = $4
      `, [subjectTemplate, bodyTextTemplate, bodyHtmlTemplate, req.params.eventTypeKey]);

      res.json({ message: 'Template updated successfully' });
    } catch (error: any) {
      console.error('[ADMIN] Error updating email template:', error.message);
      res.status(500).json({ message: 'Failed to update email template' });
    }
  }
);

/**
 * GET /api/admin/notifications/stats
 * Get notification statistics
 */
router.get(
  '/notifications/stats',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { days = '7' } = req.query;

      // Queue stats
      const queueStats = await query(`
        SELECT
          status,
          COUNT(*) as count
        FROM notification_queue
        GROUP BY status
      `);

      // History stats (last N days)
      const historyStats = await query(`
        SELECT
          DATE(sent_at) as date,
          status,
          COUNT(*) as count
        FROM notification_history
        WHERE sent_at >= NOW() - INTERVAL '${parseInt(days as string)} days'
        GROUP BY DATE(sent_at), status
        ORDER BY date DESC
      `);

      // Event type breakdown
      const eventTypeStats = await query(`
        SELECT
          event_type_key,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM notification_history
        WHERE sent_at >= NOW() - INTERVAL '${parseInt(days as string)} days'
        GROUP BY event_type_key
        ORDER BY total DESC
      `);

      res.json({
        queue: queueStats.rows.reduce((acc: Record<string, number>, row: any) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {}),
        history: historyStats.rows,
        byEventType: eventTypeStats.rows,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting notification stats:', error.message);
      res.status(500).json({ message: 'Failed to get notification stats' });
    }
  }
);

// ============================================================================
// USER ACTIVITY ANALYTICS ENDPOINTS
// ============================================================================

/**
 * GET /api/admin/analytics/active-users
 * Get currently active users (users who viewed a page in the last 5 minutes)
 */
router.get(
  '/analytics/active-users',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const minutesAgo = parseInt(req.query.minutes as string) || 5;

      const result = await query(`
        SELECT DISTINCT ON (pv.user_id)
          pv.user_id as "userId",
          u.email as "userEmail",
          u.username as "userName",
          pv.page_path as "currentPage",
          pv.page_title as "pageTitle",
          pv.device_type as "deviceType",
          pv.browser,
          pv.os,
          pv.created_at as "lastActivity"
        FROM page_views pv
        LEFT JOIN users u ON pv.user_id = u.id
        WHERE pv.created_at >= NOW() - INTERVAL '${minutesAgo} minutes'
          AND pv.user_id IS NOT NULL
        ORDER BY pv.user_id, pv.created_at DESC
      `);

      // Also get anonymous sessions (users without login)
      const anonymousResult = await query(`
        SELECT
          pv.session_id as "sessionId",
          pv.page_path as "currentPage",
          pv.page_title as "pageTitle",
          pv.device_type as "deviceType",
          pv.browser,
          pv.os,
          pv.created_at as "lastActivity"
        FROM page_views pv
        WHERE pv.created_at >= NOW() - INTERVAL '${minutesAgo} minutes'
          AND pv.user_id IS NULL
          AND pv.session_id IN (
            SELECT DISTINCT session_id
            FROM page_views
            WHERE created_at >= NOW() - INTERVAL '${minutesAgo} minutes'
              AND user_id IS NULL
          )
        ORDER BY pv.created_at DESC
      `);

      // Dedupe anonymous by session_id (keep most recent)
      const anonymousBySession = new Map();
      for (const row of anonymousResult.rows) {
        if (!anonymousBySession.has(row.sessionId)) {
          anonymousBySession.set(row.sessionId, row);
        }
      }

      res.json({
        loggedInUsers: result.rows,
        anonymousSessions: Array.from(anonymousBySession.values()),
        totalActive: result.rows.length + anonymousBySession.size,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting active users:', error.message);
      res.status(500).json({ message: 'Failed to get active users' });
    }
  }
);

/**
 * GET /api/admin/analytics/page-stats
 * Get page view statistics
 */
router.get(
  '/analytics/page-stats',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const tz = resolveTz(req.query.tz);

      // ─── Time-spent source of truth ───────────────────────────────────────
      // effective_duration excludes NULL duration_seconds (in-progress / lost beacons)
      //   so unmeasured pageviews don't pad sums, AND so sum/count share a denominator
      //   (avg × count = sum, naturally).
      // 1800s (30 min) cap per pageview suppresses forgotten tabs / idle windows.
      // Same rule used by /analytics/user-time-stats; do not diverge.

      // Page views by page (table on Pages tab) — unified time rule.
      const byPage = await query(`
        SELECT
          page_path as "pagePath",
          COUNT(*) as "viewCount",
          COUNT(DISTINCT user_id) as "uniqueUsers",
          COUNT(DISTINCT session_id) as "uniqueSessions",
          (
            SUM(LEAST(duration_seconds, 1800)) FILTER (WHERE duration_seconds IS NOT NULL)::numeric(12,2)
            / NULLIF(COUNT(*) FILTER (WHERE duration_seconds IS NOT NULL), 0)
          )::numeric(10,2) as "avgDurationSeconds",
          MAX(LEAST(duration_seconds, 1800)) FILTER (WHERE duration_seconds IS NOT NULL) as "maxDurationSeconds"
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY page_path
        ORDER BY "viewCount" DESC
        LIMIT 50
      `);

      // Page views over time (daily, viewer TZ).
      const overTime = await query(`
        WITH bounds AS (
          SELECT (date_trunc('day', NOW() AT TIME ZONE $1) - make_interval(days => $2 - 1))::date AS start_day,
                 date_trunc('day', NOW() AT TIME ZONE $1)::date AS end_day
        )
        SELECT
          to_char(date_trunc('day', created_at AT TIME ZONE $1), 'YYYY-MM-DD') as date,
          COUNT(*) as "pageViews",
          COUNT(DISTINCT user_id) as "uniqueUsers",
          COUNT(DISTINCT session_id) as "uniqueSessions"
        FROM page_views, bounds
        WHERE (created_at AT TIME ZONE $1)::date BETWEEN bounds.start_day AND bounds.end_day
        GROUP BY 1
        ORDER BY 1 ASC
      `, [tz, days]);

      // Device breakdown
      const byDevice = await query(`
        SELECT
          device_type as "deviceType",
          COUNT(*) as count,
          COUNT(DISTINCT user_id) as "uniqueUsers"
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY device_type
        ORDER BY count DESC
      `);

      // Browser breakdown
      const byBrowser = await query(`
        SELECT
          browser,
          COUNT(*) as count
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY browser
        ORDER BY count DESC
        LIMIT 10
      `);

      // Average time on each page — unified rule, capped & NULL-excluded.
      const timeByPage = await query(`
        SELECT
          page_path as "pagePath",
          (
            SUM(LEAST(duration_seconds, 1800))::numeric(12,2)
            / NULLIF(COUNT(*), 0)
          )::numeric(10,2) as "avgDuration",
          COUNT(*) as "sessionsWithDuration"
        FROM page_views
        WHERE created_at >= NOW() - INTERVAL '${days} days'
          AND duration_seconds IS NOT NULL
        GROUP BY page_path
        HAVING COUNT(*) >= 5
        ORDER BY "avgDuration" DESC
        LIMIT 20
      `);

      res.json({
        byPage: byPage.rows,
        overTime: overTime.rows,
        byDevice: byDevice.rows,
        byBrowser: byBrowser.rows,
        timeByPage: timeByPage.rows,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting page stats:', error.message);
      res.status(500).json({ message: 'Failed to get page stats' });
    }
  }
);

/**
 * GET /api/admin/analytics/user-activity/:userId
 * Get detailed activity for a specific user
 */
router.get(
  '/analytics/user-activity/:userId',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      // Recent page views
      const pageViews = await query(`
        SELECT
          page_path as "pagePath",
          page_title as "pageTitle",
          duration_seconds as "durationSeconds",
          device_type as "deviceType",
          browser,
          created_at as "timestamp"
        FROM page_views
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '${days} days'
        ORDER BY created_at DESC
        LIMIT 100
      `, [userId]);

      // Feature usage
      const featureUsage = await query(`
        SELECT
          feature_type as "featureType",
          feature_params as "params",
          result_summary as "result",
          execution_time_ms as "executionTimeMs",
          success,
          created_at as "timestamp"
        FROM feature_usage
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '${days} days'
        ORDER BY created_at DESC
        LIMIT 50
      `, [userId]);

      // Search queries
      const searches = await query(`
        SELECT
          query,
          result_count as "resultCount",
          selected_result as "selectedResult",
          created_at as "timestamp"
        FROM search_events
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '${days} days'
        ORDER BY created_at DESC
        LIMIT 50
      `, [userId]);

      // Activity summary
      const summary = await query(`
        SELECT
          COUNT(*) as "totalPageViews",
          COUNT(DISTINCT page_path) as "uniquePages",
          AVG(NULLIF(duration_seconds, 0))::numeric(10,2) as "avgPageDuration",
          SUM(duration_seconds) as "totalTimeSeconds"
        FROM page_views
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '${days} days'
      `, [userId]);

      res.json({
        pageViews: pageViews.rows,
        featureUsage: featureUsage.rows,
        searches: searches.rows,
        summary: summary.rows[0],
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting user activity:', error.message);
      res.status(500).json({ message: 'Failed to get user activity' });
    }
  }
);

/**
 * GET /api/admin/analytics/feature-usage
 * Get feature usage statistics
 */
router.get(
  '/analytics/feature-usage',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;

      // Usage by feature type
      const byFeature = await query(`
        SELECT
          feature_type as "featureType",
          COUNT(*) as "usageCount",
          COUNT(DISTINCT user_id) as "uniqueUsers",
          AVG(execution_time_ms)::numeric(10,2) as "avgExecutionMs",
          COUNT(*) FILTER (WHERE success = true) as "successCount",
          COUNT(*) FILTER (WHERE success = false) as "failureCount"
        FROM feature_usage
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY feature_type
        ORDER BY "usageCount" DESC
      `);

      // Usage over time
      const overTime = await query(`
        SELECT
          DATE(created_at) as date,
          feature_type as "featureType",
          COUNT(*) as count
        FROM feature_usage
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at), feature_type
        ORDER BY date ASC, feature_type
      `);

      // Top users by feature usage
      const topUsers = await query(`
        SELECT
          fu.user_id as "userId",
          u.email as "userEmail",
          u.username as "userName",
          COUNT(*) as "usageCount",
          array_agg(DISTINCT fu.feature_type) as "featuresUsed"
        FROM feature_usage fu
        JOIN users u ON fu.user_id = u.id
        WHERE fu.created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY fu.user_id, u.email, u.username
        ORDER BY "usageCount" DESC
        LIMIT 20
      `);

      res.json({
        byFeature: byFeature.rows,
        overTime: overTime.rows,
        topUsers: topUsers.rows,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting feature usage stats:', error.message);
      res.status(500).json({ message: 'Failed to get feature usage stats' });
    }
  }
);

/**
 * GET /api/admin/analytics/search-stats
 * Get search analytics
 */
router.get(
  '/analytics/search-stats',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;

      // Top search queries
      const topQueries = await query(`
        SELECT
          query,
          COUNT(*) as "searchCount",
          AVG(result_count)::numeric(10,2) as "avgResults",
          COUNT(*) FILTER (WHERE selected_result IS NOT NULL) as "selectCount"
        FROM search_events
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY query
        ORDER BY "searchCount" DESC
        LIMIT 50
      `);

      // Searches over time
      const overTime = await query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as "searchCount",
          COUNT(DISTINCT user_id) as "uniqueSearchers"
        FROM search_events
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `);

      // Most selected results
      const topSelections = await query(`
        SELECT
          selected_result as "selectedResult",
          COUNT(*) as "selectionCount"
        FROM search_events
        WHERE created_at >= NOW() - INTERVAL '${days} days'
          AND selected_result IS NOT NULL
        GROUP BY selected_result
        ORDER BY "selectionCount" DESC
        LIMIT 20
      `);

      res.json({
        topQueries: topQueries.rows,
        overTime: overTime.rows,
        topSelections: topSelections.rows,
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting search stats:', error.message);
      res.status(500).json({ message: 'Failed to get search stats' });
    }
  }
);

/**
 * GET /api/admin/analytics/user-time-stats
 * Get page time spent per user
 */
router.get(
  '/analytics/user-time-stats',
  requireAuth,
  requireModerator,
  async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;

      // ─── Time-spent: single source of truth ───────────────────────────────
      // Effective duration for ONE pageview =
      //   • LEAST(duration_seconds, 1800)  when duration_seconds IS NOT NULL
      //   • EXCLUDED entirely when duration_seconds IS NULL
      //
      // Rationale:
      //   - NULL means the /page-leave beacon never landed (in-progress page,
      //     tab crash, mobile pagehide skipped). Imputing a fake number would
      //     pad totals with non-measurements; dropping the row keeps the
      //     denominator and numerator on the same set so:
      //         avg_time_per_page = total_time / measured_pageviews   exactly.
      //   - 1800s (30 min) cap suppresses forgotten/idle tabs from dominating.
      //   - "Page Views" displayed to the admin still COUNT(*) all rows (incl.
      //     NULLs) because that count answers "how many pages did this user
      //     visit?", not "how much time did we measure?".
      // Any change to this rule MUST be mirrored in /analytics/page-stats.

      const userTimeStats = await query(`
        WITH eff AS (
          SELECT
            pv.user_id,
            pv.page_path,
            pv.session_id,
            pv.created_at,
            pv.duration_seconds,
            CASE
              WHEN pv.duration_seconds IS NULL THEN NULL
              ELSE LEAST(pv.duration_seconds, 1800)
            END AS effective_duration
          FROM page_views pv
          WHERE pv.created_at >= NOW() - INTERVAL '${days} days'
            AND pv.user_id IS NOT NULL
        )
        SELECT
          eff.user_id as "userId",
          u.email as "userEmail",
          u.username as "userName",
          u.avatar_url as "avatarUrl",
          COUNT(*) as "pageViews",
          COUNT(*) FILTER (WHERE eff.effective_duration IS NOT NULL) as "measuredPageViews",
          COUNT(DISTINCT eff.page_path) as "uniquePages",
          COALESCE(SUM(eff.effective_duration), 0)::numeric(12,2) as "totalTimeSeconds",
          (
            SUM(eff.effective_duration)::numeric(12,2)
            / NULLIF(COUNT(*) FILTER (WHERE eff.effective_duration IS NOT NULL), 0)
          )::numeric(10,2) as "avgTimePerPage",
          MAX(eff.created_at) as "lastActivity",
          MIN(eff.created_at) as "firstActivity"
        FROM eff
        JOIN users u ON eff.user_id = u.id
        GROUP BY eff.user_id, u.email, u.username, u.avatar_url
        ORDER BY "totalTimeSeconds" DESC NULLS LAST
        LIMIT 100
      `);

      // Top 5 pages by time per user — same effective_duration rule.
      // We also surface totalPagesCount + totalPagesTime so the UI can render
      //   "Top 5 of N pages — accounts for X of Y" without re-querying.
      const topPagesPerUser = await query(`
        WITH eff AS (
          SELECT
            user_id,
            page_path,
            CASE WHEN duration_seconds IS NULL THEN NULL ELSE LEAST(duration_seconds, 1800) END AS effective_duration
          FROM page_views
          WHERE created_at >= NOW() - INTERVAL '${days} days'
            AND user_id IS NOT NULL
        ),
        user_page_time AS (
          SELECT
            user_id,
            page_path,
            COALESCE(SUM(effective_duration), 0)::numeric(12,2) as total_time,
            COUNT(*) as view_count,
            ROW_NUMBER() OVER (
              PARTITION BY user_id
              ORDER BY COALESCE(SUM(effective_duration), 0) DESC
            ) as rn
          FROM eff
          GROUP BY user_id, page_path
        )
        SELECT
          user_id as "userId",
          page_path as "pagePath",
          total_time as "totalTime",
          view_count as "viewCount",
          rn
        FROM user_page_time
        WHERE rn <= 5
        ORDER BY user_id, rn
      `);

      // Per-user page totals (across ALL pages, for the footer note).
      const userPageTotals = await query(`
        WITH eff AS (
          SELECT
            user_id,
            page_path,
            CASE WHEN duration_seconds IS NULL THEN NULL ELSE LEAST(duration_seconds, 1800) END AS effective_duration
          FROM page_views
          WHERE created_at >= NOW() - INTERVAL '${days} days'
            AND user_id IS NOT NULL
        ),
        per_page AS (
          SELECT user_id, page_path, COALESCE(SUM(effective_duration), 0)::numeric(12,2) AS page_total
          FROM eff
          GROUP BY user_id, page_path
        )
        SELECT
          user_id as "userId",
          COUNT(*) as "totalPagesCount",
          COALESCE(SUM(page_total), 0)::numeric(12,2) as "totalPagesTime"
        FROM per_page
        GROUP BY user_id
      `);

      // Session breakdown per user — same rule applied at session level.
      const sessionStats = await query(`
        WITH eff AS (
          SELECT
            user_id,
            session_id,
            CASE WHEN duration_seconds IS NULL THEN NULL ELSE LEAST(duration_seconds, 1800) END AS effective_duration
          FROM page_views
          WHERE created_at >= NOW() - INTERVAL '${days} days'
        ),
        session_duration AS (
          SELECT session_id, COALESCE(SUM(effective_duration), 0)::numeric(12,2) AS total_time
          FROM eff
          GROUP BY session_id
        )
        SELECT
          eff.user_id as "userId",
          COUNT(DISTINCT eff.session_id) as "sessionCount",
          AVG(session_duration.total_time)::numeric(10,2) as "avgSessionDuration",
          MAX(session_duration.total_time)::numeric(10,2) as "maxSessionDuration"
        FROM eff
        LEFT JOIN session_duration ON eff.session_id = session_duration.session_id
        WHERE eff.user_id IS NOT NULL
        GROUP BY eff.user_id
      `);

      // Platform overview — derives from the same rule, so per-user totals
      //   sum to totalPlatformTime exactly, and avgPageTime = total/measured.
      const overview = await query(`
        WITH eff AS (
          SELECT
            CASE WHEN duration_seconds IS NULL THEN NULL ELSE LEAST(duration_seconds, 1800) END AS effective_duration,
            user_id
          FROM page_views
          WHERE created_at >= NOW() - INTERVAL '${days} days'
            AND user_id IS NOT NULL
        )
        SELECT
          COUNT(DISTINCT user_id) as "activeUsers",
          COALESCE(SUM(effective_duration), 0)::numeric(12,2) as "totalPlatformTime",
          (
            SUM(effective_duration)::numeric(12,2)
            / NULLIF(COUNT(*) FILTER (WHERE effective_duration IS NOT NULL), 0)
          )::numeric(10,2) as "avgPageTime",
          COUNT(*) as "totalPageViews",
          COUNT(*) FILTER (WHERE effective_duration IS NOT NULL) as "measuredPageViews"
        FROM eff
      `);

      const pagesByUser: Record<string, { pagePath: string; totalTime: number; viewCount: number }[]> = {};
      topPagesPerUser.rows.forEach((row: any) => {
        if (!pagesByUser[row.userId]) pagesByUser[row.userId] = [];
        pagesByUser[row.userId].push({
          pagePath: row.pagePath,
          totalTime: parseFloat(row.totalTime) || 0,
          viewCount: parseInt(row.viewCount),
        });
      });

      const userPageTotalsMap: Record<string, { totalPagesCount: number; totalPagesTime: number }> = {};
      userPageTotals.rows.forEach((row: any) => {
        userPageTotalsMap[row.userId] = {
          totalPagesCount: parseInt(row.totalPagesCount) || 0,
          totalPagesTime: parseFloat(row.totalPagesTime) || 0,
        };
      });

      const sessionStatsMap: Record<string, any> = {};
      sessionStats.rows.forEach((row: any) => {
        sessionStatsMap[row.userId] = {
          sessionCount: parseInt(row.sessionCount),
          avgSessionDuration: parseFloat(row.avgSessionDuration) || 0,
          maxSessionDuration: parseFloat(row.maxSessionDuration) || 0,
        };
      });

      const users = userTimeStats.rows.map((row: any) => {
        const totals = userPageTotalsMap[row.userId] || { totalPagesCount: 0, totalPagesTime: 0 };
        return {
          userId: row.userId,
          userEmail: row.userEmail,
          userName: row.userName,
          avatarUrl: row.avatarUrl,
          pageViews: parseInt(row.pageViews),
          measuredPageViews: parseInt(row.measuredPageViews) || 0,
          uniquePages: parseInt(row.uniquePages),
          totalTimeSeconds: parseFloat(row.totalTimeSeconds) || 0,
          avgTimePerPage: parseFloat(row.avgTimePerPage) || 0,
          lastActivity: row.lastActivity,
          firstActivity: row.firstActivity,
          topPages: pagesByUser[row.userId] || [],
          totalPagesCount: totals.totalPagesCount,
          totalPagesTime: totals.totalPagesTime,
          sessions: sessionStatsMap[row.userId] || { sessionCount: 0, avgSessionDuration: 0, maxSessionDuration: 0 },
        };
      });

      res.json({
        users,
        overview: overview.rows[0] ? {
          activeUsers: parseInt(overview.rows[0].activeUsers) || 0,
          totalPlatformTime: parseFloat(overview.rows[0].totalPlatformTime) || 0,
          avgPageTime: parseFloat(overview.rows[0].avgPageTime) || 0,
          totalPageViews: parseInt(overview.rows[0].totalPageViews) || 0,
          measuredPageViews: parseInt(overview.rows[0].measuredPageViews) || 0,
        } : {
          activeUsers: 0,
          totalPlatformTime: 0,
          avgPageTime: 0,
          totalPageViews: 0,
          measuredPageViews: 0,
        },
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting user time stats:', error.message);
      res.status(500).json({ message: 'Failed to get user time stats' });
    }
  }
);

// ============================================================================
// ADMIN API KEY MANAGEMENT
// ============================================================================

/**
 * Helper to sanitize API key for admin responses (camelCase + omit hash).
 */
function sanitizeApiKey(k: ApiKey) {
  return {
    id: k.id,
    userId: k.user_id,
    name: k.name,
    keyPrefix: k.key_prefix,
    tier: k.tier,
    keyType: k.key_type,
    rateLimitPerMinute: k.rate_limit_per_minute,
    rateLimitPerHour: k.rate_limit_per_hour,
    rateLimitPerDay: k.rate_limit_per_day,
    allowedOrigins: k.allowed_origins,
    allowedIps: k.allowed_ips,
    allowedEndpoints: k.allowed_endpoints,
    createdBy: k.created_by,
    description: k.description,
    isActive: k.is_active,
    lastUsedAt: k.last_used_at,
    lastUsedIp: k.last_used_ip,
    expiresAt: k.expires_at,
    revokedAt: k.revoked_at,
    revokedReason: k.revoked_reason,
    createdAt: k.created_at,
    updatedAt: k.updated_at,
  };
}

/**
 * GET /api/admin/api-keys — List all API keys (with optional filters).
 */
router.get(
  '/api-keys',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { search, user_id, tier, key_type, is_active, page = '1', limit = '50' } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
      const offset = (pageNum - 1) * limitNum;

      let where = 'WHERE 1=1';
      const params: any[] = [];
      let idx = 1;

      if (search) {
        where += ` AND (ak.name ILIKE $${idx} OR ak.key_prefix ILIKE $${idx} OR u.email ILIKE $${idx})`;
        params.push(`%${search}%`);
        idx++;
      }
      if (user_id) {
        where += ` AND ak.user_id = $${idx}`;
        params.push(user_id);
        idx++;
      }
      if (tier) {
        where += ` AND ak.tier = $${idx}`;
        params.push(tier);
        idx++;
      }
      if (key_type) {
        where += ` AND ak.key_type = $${idx}`;
        params.push(key_type);
        idx++;
      }
      if (is_active === 'true') {
        where += ` AND ak.is_active = TRUE AND ak.revoked_at IS NULL`;
      } else if (is_active === 'false') {
        where += ` AND (ak.is_active = FALSE OR ak.revoked_at IS NOT NULL)`;
      }

      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM api_keys ak LEFT JOIN users u ON ak.user_id = u.id ${where}`,
        params
      );
      const total = parseInt(countResult.rows[0]?.count || '0', 10);

      const keysResult = await query<ApiKey & { user_email?: string; user_name?: string }>(
        `SELECT ak.*, u.email as user_email, u.name as user_name
         FROM api_keys ak LEFT JOIN users u ON ak.user_id = u.id
         ${where}
         ORDER BY ak.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limitNum, offset]
      );

      const keys = keysResult.rows.map((k) => ({
        ...sanitizeApiKey(k),
        userEmail: (k as any).user_email,
        userName: (k as any).user_name,
      }));

      res.json({
        data: keys,
        meta: { count: keys.length, total, page: pageNum, limit: limitNum, has_more: offset + limitNum < total },
      });
    } catch (error: any) {
      console.error('[ADMIN] Error listing API keys:', error.message);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list API keys' } });
    }
  }
);

/**
 * GET /api/admin/api-keys/stats — Aggregate stats.
 */
router.get(
  '/api-keys/stats',
  requireAuth,
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const stats = await queryOne<{
        total_keys: string;
        active_keys: string;
        enterprise_keys: string;
        admin_keys: string;
      }>(`SELECT
        COUNT(*) as total_keys,
        COUNT(*) FILTER (WHERE is_active = TRUE AND revoked_at IS NULL) as active_keys,
        COUNT(*) FILTER (WHERE tier = 'enterprise') as enterprise_keys,
        COUNT(*) FILTER (WHERE key_type = 'admin') as admin_keys
        FROM api_keys`);

      res.json({
        data: {
          totalKeys: parseInt(stats?.total_keys || '0', 10),
          activeKeys: parseInt(stats?.active_keys || '0', 10),
          enterpriseKeys: parseInt(stats?.enterprise_keys || '0', 10),
          adminKeys: parseInt(stats?.admin_keys || '0', 10),
        },
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting API key stats:', error.message);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get stats' } });
    }
  }
);

/**
 * GET /api/admin/api-keys/:keyId — Single key detail.
 */
router.get(
  '/api-keys/:keyId',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const keyRecord = await getKeyById(req.params.keyId);
      if (!keyRecord) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API key not found' } });
      }
      res.json({ data: sanitizeApiKey(keyRecord) });
    } catch (error: any) {
      console.error('[ADMIN] Error getting API key:', error.message);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get API key' } });
    }
  }
);

/**
 * POST /api/admin/api-keys — Create admin/enterprise key.
 */
router.post(
  '/api-keys',
  requireAuth,
  requireAdmin,
  logAdminAction('create_api_key'),
  async (req: Request, res: Response) => {
    try {
      const {
        userId, name, description, tier, rateLimitPerMinute, rateLimitPerHour,
        rateLimitPerDay, allowedIps, allowedEndpoints, allowedOrigins, expiresAt,
      } = req.body;

      if (!userId || !name) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'userId and name are required' } });
      }

      const adminUserId = (req as any).user?.userId;

      const { fullKey, record } = await createApiKey({
        userId,
        name,
        description,
        tier: tier || 'enterprise',
        keyType: 'admin',
        rateLimitPerMinute,
        rateLimitPerHour,
        rateLimitPerDay,
        allowedIps: allowedIps || [],
        allowedEndpoints: allowedEndpoints || [],
        allowedOrigins: allowedOrigins || [],
        createdBy: adminUserId,
        expiresAt,
      });

      // Audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [adminUserId, 'create_api_key', 'api_key', record.id, JSON.stringify({ name, tier: tier || 'enterprise', userId }), req.ip]
      );

      notifyApiKeyCreated(userId, name);

      res.status(201).json({ data: { key: fullKey, apiKey: sanitizeApiKey(record) } });
    } catch (error: any) {
      console.error('[ADMIN] Error creating API key:', error.message);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to create API key' } });
    }
  }
);

/**
 * PATCH /api/admin/api-keys/:keyId — Update key settings.
 */
router.patch(
  '/api-keys/:keyId',
  requireAuth,
  requireAdmin,
  logAdminAction('update_api_key'),
  async (req: Request, res: Response) => {
    try {
      const keyRecord = await getKeyById(req.params.keyId);
      if (!keyRecord) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API key not found' } });
      }

      const adminUserId = (req as any).user?.userId;
      const updates: Record<string, any> = {};
      const allowedFields = [
        'name', 'description', 'tier',
        'rate_limit_per_minute', 'rate_limit_per_hour', 'rate_limit_per_day',
        'allowed_ips', 'allowed_endpoints', 'allowed_origins', 'expires_at',
      ];

      // Map camelCase body to snake_case DB fields
      const fieldMap: Record<string, string> = {
        rateLimitPerMinute: 'rate_limit_per_minute',
        rateLimitPerHour: 'rate_limit_per_hour',
        rateLimitPerDay: 'rate_limit_per_day',
        allowedIps: 'allowed_ips',
        allowedEndpoints: 'allowed_endpoints',
        allowedOrigins: 'allowed_origins',
        expiresAt: 'expires_at',
      };

      for (const [bodyKey, dbKey] of Object.entries(fieldMap)) {
        if (req.body[bodyKey] !== undefined) updates[dbKey] = req.body[bodyKey];
      }
      for (const f of ['name', 'description', 'tier']) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
      }

      const updated = await updateKey(req.params.keyId, updates);
      if (!updated) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API key not found' } });
      }

      // Invalidate Redis cache for this key
      const redis = getRedis();
      if (redis) {
        try { await redis.del(`apikey:${keyRecord.key_hash}`); } catch { /* ignore */ }
      }

      // Audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, previous_value, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [adminUserId, 'update_api_key', 'api_key', req.params.keyId,
         JSON.stringify({ name: keyRecord.name, tier: keyRecord.tier }),
         JSON.stringify(updates), req.ip]
      );

      notifyApiKeyUpdated(keyRecord.user_id, updated.name);

      res.json({ data: sanitizeApiKey(updated) });
    } catch (error: any) {
      console.error('[ADMIN] Error updating API key:', error.message);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to update API key' } });
    }
  }
);

/**
 * DELETE /api/admin/api-keys/:keyId — Revoke key.
 */
router.delete(
  '/api-keys/:keyId',
  requireAuth,
  requireAdmin,
  logAdminAction('revoke_api_key'),
  async (req: Request, res: Response) => {
    try {
      const keyRecord = await getKeyById(req.params.keyId);
      if (!keyRecord) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API key not found' } });
      }

      const adminUserId = (req as any).user?.userId;
      const reason = req.body?.reason || 'Revoked by admin';

      await revokeKey(req.params.keyId, keyRecord.user_id, reason);

      // Invalidate Redis cache
      const redis = getRedis();
      if (redis) {
        try { await redis.del(`apikey:${keyRecord.key_hash}`); } catch { /* ignore */ }
      }

      // Audit log
      await query(
        `INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, previous_value, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [adminUserId, 'revoke_api_key', 'api_key', req.params.keyId,
         JSON.stringify({ name: keyRecord.name, reason }), req.ip]
      );

      notifyApiKeyRevoked(keyRecord.user_id, keyRecord.name);

      res.json({ data: { success: true } });
    } catch (error: any) {
      console.error('[ADMIN] Error revoking API key:', error.message);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to revoke API key' } });
    }
  }
);

/**
 * GET /api/admin/api-keys/:keyId/usage — Usage stats for a key.
 */
router.get(
  '/api-keys/:keyId/usage',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const period = (req.query.period as string) || '7d';
      let days = 7;
      if (period === '24h') days = 1;
      else if (period === '30d') days = 30;
      else if (period === '90d') days = 90;

      const since = new Date(Date.now() - days * 86400000);

      const usageResult = await query<{
        endpoint: string; method: string; status_code: number;
        response_time_ms: number; created_at: string;
      }>(
        `SELECT endpoint, method, status_code, response_time_ms, created_at
         FROM api_usage_log
         WHERE api_key_id = $1 AND created_at >= $2
         ORDER BY created_at DESC
         LIMIT 1000`,
        [req.params.keyId, since.toISOString()]
      );

      const rows = usageResult.rows;
      const totalRequests = rows.length;
      const byEndpoint: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      const byDay: Record<string, number> = {};

      for (const r of rows) {
        byEndpoint[r.endpoint] = (byEndpoint[r.endpoint] || 0) + 1;
        const status = String(r.status_code || 'unknown');
        byStatus[status] = (byStatus[status] || 0) + 1;
        const day = r.created_at?.substring(0, 10) || 'unknown';
        byDay[day] = (byDay[day] || 0) + 1;
      }

      res.json({
        data: {
          totalRequests,
          period,
          byEndpoint,
          byStatus,
          byDay: Object.entries(byDay)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, count]) => ({ date, count })),
        },
      });
    } catch (error: any) {
      console.error('[ADMIN] Error getting API key usage:', error.message);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get usage data' } });
    }
  }
);

export default router;
