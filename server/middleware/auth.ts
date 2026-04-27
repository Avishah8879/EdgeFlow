/**
 * Authentication Middleware
 *
 * Provides Express middleware for JWT token verification and route protection.
 * Supports both required authentication and optional authentication.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../auth/jwt';
import { findSessionByTokenV2, updateSessionActivityV2 } from '../auth/store-v2';

/**
 * Extend Express User to include our auth payload fields
 */
declare global {
  namespace Express {
    interface User extends AccessTokenPayload {}
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Require Authentication Middleware
 *
 * Verifies JWT token and attaches user to request.
 * Returns 401 if token is missing, invalid, or expired.
 *
 * @example
 * app.get('/api/protected', requireAuth, (req, res) => {
 *   console.log('User ID:', req.user.userId);
 *   res.json({ message: 'Authenticated!' });
 * });
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      res.status(401).json({ message: 'No authentication token provided' });
      return;
    }

    // Verify JWT token
    let decoded: AccessTokenPayload;
    try {
      decoded = verifyAccessToken(token);
    } catch (error: any) {
      if (error.message.includes('expired')) {
        res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
        return;
      }
      res.status(401).json({ message: 'Invalid token', code: 'INVALID_TOKEN' });
      return;
    }

    // Check if session exists and is not revoked
    const session = await findSessionByTokenV2(token);
    if (!session) {
      res.status(401).json({
        message: 'Session not found or has been revoked',
        code: 'SESSION_REVOKED',
      });
      return;
    }

    // Update session activity
    await updateSessionActivityV2(token);

    // Attach user to request
    req.user = decoded;

    next();
  } catch (error: any) {
    console.error('[AUTH_MIDDLEWARE] Error:', error.message);
    res.status(500).json({ message: 'Authentication error' });
  }
}

/**
 * Optional Authentication Middleware
 *
 * Tries to verify token and attach user to request,
 * but continues even if token is missing or invalid.
 * Useful for endpoints that work differently for authenticated vs anonymous users.
 *
 * @example
 * app.get('/api/content', optionalAuth, (req, res) => {
 *   if (req.user) {
 *     // Show personalized content
 *   } else {
 *     // Show generic content
 *   }
 * });
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (token) {
      try {
        const decoded = verifyAccessToken(token);
        const session = await findSessionByTokenV2(token);

        if (session) {
          // Valid token and session
          req.user = decoded;
          await updateSessionActivityV2(token);
        }
      } catch (error) {
        // Token invalid but continue anyway
        console.log('[AUTH_MIDDLEWARE] Optional auth failed, continuing as anonymous');
      }
    }

    next();
  } catch (error: any) {
    console.error('[AUTH_MIDDLEWARE] Unexpected error:', error.message);
    next(); // Continue even on error
  }
}

/**
 * Require Specific Tier Middleware
 *
 * Ensures authenticated user has one of the allowed tiers.
 * Must be used AFTER requireAuth middleware.
 *
 * @param allowedTiers - Array of allowed tier values
 *
 * @example
 * app.get('/api/premium-feature',
 *   requireAuth,
 *   requireTier(['premium']),
 *   (req, res) => {
 *     res.json({ message: 'Premium content!' });
 *   }
 * );
 */
export function requireTier(allowedTiers: ('free' | 'semi' | 'pro')[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    if (!allowedTiers.includes(req.user.tier)) {
      res.status(403).json({
        message: 'Insufficient permissions',
        requiredTier: allowedTiers,
        currentTier: req.user.tier,
      });
      return;
    }

    next();
  };
}

/**
 * Require Specific Provider Middleware
 *
 * Ensures authenticated user used a specific authentication provider.
 * Must be used AFTER requireAuth middleware.
 *
 * @param allowedProviders - Array of allowed providers
 *
 * @example
 * app.post('/api/change-password',
 *   requireAuth,
 *   requireProvider(['password']),
 *   (req, res) => {
 *     // Only password users can change password
 *   }
 * );
 */
export function requireProvider(allowedProviders: ('password' | 'google')[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    if (!allowedProviders.includes(req.user.provider)) {
      res.status(403).json({
        message: 'This operation is not available for your authentication method',
        allowedProviders,
        currentProvider: req.user.provider,
      });
      return;
    }

    next();
  };
}

/**
 * Require Email Verified Middleware
 *
 * Ensures authenticated user has verified their email.
 * Must be used AFTER requireAuth middleware.
 *
 * Note: Currently checks if provider is 'google' (always verified)
 * or if email verification is implemented for password users.
 *
 * @example
 * app.post('/api/sensitive-operation',
 *   requireAuth,
 *   requireEmailVerified,
 *   (req, res) => {
 *     res.json({ message: 'Operation completed' });
 *   }
 * );
 */
export async function requireEmailVerified(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  // Google users are always verified
  if (req.user.provider === 'google') {
    next();
    return;
  }

  // For password users, check email_verified field
  // TODO: Implement email verification logic if needed
  // For now, allow all authenticated users
  next();
}

/**
 * Admin Only Middleware
 *
 * Requires the user to have admin or super_admin role.
 * Must be used AFTER requireAuth middleware.
 *
 * @example
 * app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
 *   res.json({ users: [] });
 * });
 */
export { requireAdminRole as requireAdmin } from './admin';

/**
 * Re-export role-based middleware for convenience
 */
export {
  requireRole,
  requireModerator,
  requireSuperAdmin,
  requireExactRole,
  requireAnyRole,
  logAdminAction,
} from './admin';
