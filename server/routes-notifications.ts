/**
 * User-Facing Notification Routes
 *
 * Provides endpoints for users to fetch active notifications
 * and dismiss them.
 */

import { Router, Request, Response } from 'express';
import { query, queryOne } from './db/auth-connection';
import { optionalAuth, requireAuth } from './middleware/auth';

const router = Router();

/**
 * GET /api/notifications/active
 * Get all active notifications for the current user
 */
router.get(
  '/active',
  optionalAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      const userRole = req.user?.role || 'user';

      // Get active notifications that:
      // 1. Are currently active
      // 2. Have started (or have no start date)
      // 3. Haven't expired (or have no expiry date)
      // 4. Target the user's role (or target all roles)
      // 5. Haven't been dismissed by this user
      const result = await query(
        `SELECT n.*
         FROM system_notifications n
         WHERE n.is_active = TRUE
           AND (n.scheduled_start IS NULL OR n.scheduled_start <= NOW())
           AND (n.scheduled_end IS NULL OR n.scheduled_end > NOW())
           AND (n.target_audience IS NULL OR n.target_audience = 'all' OR n.target_audience = $1)
           AND NOT EXISTS (
             SELECT 1 FROM notification_dismissals d
             WHERE d.notification_id = n.id AND d.user_id = $2
           )
         ORDER BY n.created_at DESC`,
        [userRole, userId || '00000000-0000-0000-0000-000000000000']
      );

      res.json({ notifications: result.rows });
    } catch (error: any) {
      console.error('[NOTIFICATIONS] Error getting active notifications:', error.message);
      res.status(500).json({ message: 'Failed to get notifications' });
    }
  }
);

/**
 * POST /api/notifications/:id/dismiss
 * Dismiss a notification for the current user
 */
router.post(
  '/:id/dismiss',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const notificationId = req.params.id;
      const userId = req.user!.userId;

      // Check if notification exists and is dismissible
      const notification = await queryOne<{ is_dismissible: boolean }>(
        'SELECT is_dismissible FROM system_notifications WHERE id = $1',
        [notificationId]
      );

      if (!notification) {
        res.status(404).json({ message: 'Notification not found' });
        return;
      }

      if (!notification.is_dismissible) {
        res.status(400).json({ message: 'This notification cannot be dismissed' });
        return;
      }

      // Record dismissal
      await query(
        `INSERT INTO notification_dismissals (notification_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (notification_id, user_id) DO NOTHING`,
        [notificationId, userId]
      );

      res.json({ message: 'Notification dismissed' });
    } catch (error: any) {
      console.error('[NOTIFICATIONS] Error dismissing notification:', error.message);
      res.status(500).json({ message: 'Failed to dismiss notification' });
    }
  }
);

/**
 * GET /api/notifications/dismissed
 * Get list of notifications the user has dismissed
 */
router.get(
  '/dismissed',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;

      const result = await query(
        `SELECT n.*, d.dismissed_at
         FROM system_notifications n
         JOIN notification_dismissals d ON n.id = d.notification_id
         WHERE d.user_id = $1
         ORDER BY d.dismissed_at DESC
         LIMIT 50`,
        [userId]
      );

      res.json({ notifications: result.rows });
    } catch (error: any) {
      console.error('[NOTIFICATIONS] Error getting dismissed notifications:', error.message);
      res.status(500).json({ message: 'Failed to get dismissed notifications' });
    }
  }
);

export default router;
