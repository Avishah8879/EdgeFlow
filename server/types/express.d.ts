/**
 * Express Request type augmentation for user authentication
 * This extends the Express Request type to include the authenticated user
 *
 * Note: This interface must match AccessTokenPayload from server/auth/jwt.ts
 */
declare global {
  namespace Express {
    interface User {
      userId: string;
      email: string;
      username: string;
      tier: 'free' | 'semi' | 'pro';
      provider: 'password' | 'google';
      role?: 'user' | 'moderator' | 'admin' | 'super_admin';
      platformId?: string;
      type: 'access';
      iat?: number;
      exp?: number;
      // Additional optional fields for backwards compatibility
      name?: string;
      avatarUrl?: string;
      subscriptionStatus?: string;
      subscriptionPlanId?: string;
    }
    interface Request {
      user?: User;
    }
  }
}

export {};
