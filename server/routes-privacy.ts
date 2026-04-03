/**
 * Privacy Consent Routes
 *
 * Handles user privacy consent preferences for tracking.
 * Supports both authenticated users and anonymous sessions.
 */

import { Router, Request, Response } from 'express';
import { query, queryOne } from './db/auth-connection';
import { requireAuth, optionalAuth } from './middleware/auth';

const router = Router();

type ConsentLevel = 'none' | 'essential' | 'all';

interface ConsentRecord {
  id: string;
  user_id: string | null;
  session_id: string | null;
  consent_level: ConsentLevel;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * GET /api/privacy/consent
 * Get current user's consent status
 */
router.get(
  '/consent',
  optionalAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      const sessionId = req.headers['x-session-id'] as string | undefined;

      if (!userId && !sessionId) {
        // No user or session - return default
        res.json({
          consentLevel: 'none',
          isAnonymous: true,
        });
        return;
      }

      // Check for existing consent
      let consent: ConsentRecord | null = null;

      if (userId) {
        // Check user's stored consent in users table
        const userResult = await queryOne<{ tracking_consent: ConsentLevel; consent_updated_at: Date }>(
          'SELECT tracking_consent, consent_updated_at FROM users WHERE id = $1',
          [userId]
        );

        if (userResult) {
          res.json({
            consentLevel: userResult.tracking_consent || 'none',
            updatedAt: userResult.consent_updated_at?.toISOString() || null,
            isAnonymous: false,
          });
          return;
        }
      }

      if (sessionId) {
        // Check session-based consent
        consent = await queryOne<ConsentRecord>(
          'SELECT * FROM privacy_consent WHERE session_id = $1 ORDER BY updated_at DESC LIMIT 1',
          [sessionId]
        );

        if (consent) {
          res.json({
            consentLevel: consent.consent_level,
            updatedAt: consent.updated_at?.toISOString() || null,
            isAnonymous: true,
          });
          return;
        }
      }

      // No consent found
      res.json({
        consentLevel: 'none',
        isAnonymous: !userId,
      });
    } catch (error: any) {
      console.error('[PRIVACY] Error getting consent:', error.message);
      res.status(500).json({ message: 'Failed to get consent status' });
    }
  }
);

/**
 * POST /api/privacy/consent
 * Set user's consent level
 */
router.post(
  '/consent',
  optionalAuth,
  async (req: Request, res: Response) => {
    try {
      const { consentLevel } = req.body as { consentLevel: ConsentLevel };
      const userId = req.user?.userId;
      const sessionId = req.headers['x-session-id'] as string | undefined;

      if (!consentLevel || !['none', 'essential', 'all'].includes(consentLevel)) {
        res.status(400).json({ message: 'Invalid consent level. Must be none, essential, or all' });
        return;
      }

      const ipAddress = req.ip;
      const userAgent = req.get('user-agent');

      if (userId) {
        // Update user's consent in users table
        await query(
          `UPDATE users
           SET tracking_consent = $1, consent_updated_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [consentLevel, userId]
        );

        // Also log to privacy_consent table for history
        await query(
          `INSERT INTO privacy_consent (user_id, consent_level, ip_address, user_agent)
           VALUES ($1, $2, $3, $4)`,
          [userId, consentLevel, ipAddress, userAgent]
        );

        res.json({
          message: 'Consent updated successfully',
          consentLevel,
          isAnonymous: false,
        });
      } else if (sessionId) {
        // Store anonymous consent
        await query(
          `INSERT INTO privacy_consent (session_id, consent_level, ip_address, user_agent)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (session_id) WHERE session_id IS NOT NULL
           DO UPDATE SET consent_level = $2, ip_address = $3, user_agent = $4, updated_at = NOW()`,
          [sessionId, consentLevel, ipAddress, userAgent]
        );

        res.json({
          message: 'Consent updated successfully',
          consentLevel,
          isAnonymous: true,
        });
      } else {
        res.status(400).json({
          message: 'Either authentication or x-session-id header is required',
        });
      }
    } catch (error: any) {
      console.error('[PRIVACY] Error setting consent:', error.message);
      res.status(500).json({ message: 'Failed to set consent' });
    }
  }
);

/**
 * GET /api/privacy/consent/history
 * Get consent change history for authenticated user
 */
router.get(
  '/consent/history',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;

      const result = await query(
        `SELECT consent_level, ip_address, created_at
         FROM privacy_consent
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      );

      res.json({ history: result.rows });
    } catch (error: any) {
      console.error('[PRIVACY] Error getting consent history:', error.message);
      res.status(500).json({ message: 'Failed to get consent history' });
    }
  }
);

export default router;
