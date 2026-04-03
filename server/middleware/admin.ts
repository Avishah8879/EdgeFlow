/**
 * Admin Role Middleware
 *
 * Provides Express middleware for role-based access control.
 * Supports hierarchical roles: user < moderator < admin < super_admin
 */

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../auth/jwt';
import { hasRoleLevel, logAuthEventV2 } from '../auth/store-v2';

/**
 * Role hierarchy levels for comparison
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  'user': 0,
  'moderator': 1,
  'admin': 2,
  'super_admin': 3,
};

/**
 * Require Specific Role Middleware
 *
 * Ensures authenticated user has at least the required role level.
 * Must be used AFTER requireAuth middleware.
 *
 * @param requiredRole - Minimum role level required
 *
 * @example
 * app.get('/api/admin/users',
 *   requireAuth,
 *   requireRole('admin'),
 *   (req, res) => {
 *     res.json({ users: [] });
 *   }
 * );
 */
export function requireRole(requiredRole: UserRole) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const userRole = req.user.role || 'user';

    if (!hasRoleLevel(userRole, requiredRole)) {
      // Log unauthorized access attempt
      await logAuthEventV2({
        userId: req.user.userId,
        eventType: 'unauthorized_access_attempt',
        provider: req.user.provider,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        success: false,
        failureReason: `Required role: ${requiredRole}, User role: ${userRole}`,
        metadata: {
          path: req.path,
          method: req.method,
          requiredRole,
          userRole,
        },
      });

      res.status(403).json({
        message: 'Insufficient permissions',
        requiredRole,
        currentRole: userRole,
      });
      return;
    }

    next();
  };
}

/**
 * Require Moderator or Above Middleware
 *
 * Shorthand for requireRole('moderator')
 */
export const requireModerator = requireRole('moderator');

/**
 * Require Admin or Above Middleware
 *
 * Shorthand for requireRole('admin')
 */
export const requireAdminRole = requireRole('admin');

/**
 * Require Super Admin Middleware
 *
 * Shorthand for requireRole('super_admin')
 * Only super_admin can access these routes
 */
export const requireSuperAdmin = requireRole('super_admin');

/**
 * Require Exact Role Middleware
 *
 * Ensures authenticated user has EXACTLY the specified role (not higher).
 * Useful for restricting actions to specific role levels.
 *
 * @param exactRole - Exact role required
 */
export function requireExactRole(exactRole: UserRole) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const userRole = req.user.role || 'user';

    if (userRole !== exactRole) {
      res.status(403).json({
        message: 'Exact role match required',
        requiredRole: exactRole,
        currentRole: userRole,
      });
      return;
    }

    next();
  };
}

/**
 * Require Any of Roles Middleware
 *
 * Ensures authenticated user has one of the specified roles.
 *
 * @param allowedRoles - Array of allowed roles
 *
 * @example
 * app.get('/api/moderate/content',
 *   requireAuth,
 *   requireAnyRole(['moderator', 'admin', 'super_admin']),
 *   (req, res) => { ... }
 * );
 */
export function requireAnyRole(allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const userRole = req.user.role || 'user';

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        message: 'Insufficient permissions',
        allowedRoles,
        currentRole: userRole,
      });
      return;
    }

    next();
  };
}

/**
 * Log Admin Action Middleware
 *
 * Logs admin actions to the audit log for compliance.
 * Should be used on sensitive admin endpoints.
 *
 * @param action - Description of the action being performed
 *
 * @example
 * app.post('/api/admin/users/:id/ban',
 *   requireAuth,
 *   requireAdminRole,
 *   logAdminAction('ban_user'),
 *   (req, res) => { ... }
 * );
 */
export function logAdminAction(action: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next();
      return;
    }

    // Log the action before it happens
    await logAuthEventV2({
      userId: req.user.userId,
      eventType: `admin_${action}`,
      provider: req.user.provider,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      success: true,
      metadata: {
        path: req.path,
        method: req.method,
        params: req.params,
        query: req.query,
        role: req.user.role || 'user',
      },
    });

    next();
  };
}
