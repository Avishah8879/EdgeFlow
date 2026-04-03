/**
 * Google OAuth Routes
 *
 * Handles Google OAuth 2.0 authentication flow:
 * 1. GET /auth/google - Redirects to Google consent screen
 * 2. GET /auth/google/callback - Handles OAuth callback, creates session, redirects to frontend
 * 3. GET /auth/google/link - Link Google to existing account (requires auth)
 * 4. POST /auth/google/unlink - Unlink Google from account (requires auth)
 */

import { Router, Request, Response, NextFunction } from 'express';
import passport from './auth/oauth-google';
import { createJwtSessionPayload } from './auth/session-jwt';
import {
  updateLastLoginV2,
  logAuthEventV2,
  DbUser,
  linkGoogleAccountV2,
  unlinkGoogleAccountV2,
  hasGoogleLinkedV2
} from './auth/store-v2';
import { oauthCallbackRateLimiter } from './middleware/rate-limit';
import { requireAuth } from './middleware/auth';
import jwt from 'jsonwebtoken';

const router = Router();

// Get frontend URL from environment (fallback only)
const FRONTEND_URL = process.env.VITE_AUTH_BASE_URL || 'http://localhost:5173';

/**
 * Get dynamic frontend URL based on request host.
 * This allows OAuth to work from both localhost and ngrok.
 */
function getDynamicFrontendUrl(req: Request): string {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:81');

  // Determine protocol: ngrok always uses HTTPS, localhost uses HTTP
  let protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  if (host.includes('ngrok')) {
    protocol = 'https'; // Force HTTPS for ngrok domains
  }

  return `${protocol}://${host}`;
}

/**
 * GET /auth/google
 *
 * Initiates Google OAuth flow by redirecting to Google consent screen.
 * User will be prompted to grant permissions (email, profile).
 */
router.get(
  '/google',
  (req: Request, res: Response, next: NextFunction) => {
    console.log('[OAUTH_GOOGLE] Initiating OAuth flow');

    // Check if Google OAuth is configured
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error('[OAUTH_GOOGLE] Google OAuth not configured');
      return res.redirect(`${getDynamicFrontendUrl(req)}/login?error=oauth_not_configured`);
    }

    // Get dynamic callback URL based on request host
    const callbackURL = `${getDynamicFrontendUrl(req)}/auth/google/callback`;
    console.log('[OAUTH_GOOGLE] Dynamic callback URL:', callbackURL);

    // Use type assertion - passport supports callbackURL at authenticate time
    // but @types/passport-google-oauth20 doesn't include it in the type definitions
    (passport.authenticate as any)('google', {
      scope: ['profile', 'email'],
      session: false,
      callbackURL, // Dynamic callback URL for both localhost and ngrok
    })(req, res, next);
  }
);

/**
 * GET /auth/google/callback
 *
 * OAuth callback route. Google redirects here after user grants/denies permissions.
 * Creates JWT session and redirects to frontend with tokens.
 */
router.get(
  '/google/callback',
  oauthCallbackRateLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    // Use same dynamic URL that was used in the initial auth request
    const dynamicBaseUrl = getDynamicFrontendUrl(req);
    const callbackURL = `${dynamicBaseUrl}/auth/google/callback`;
    console.log('[OAUTH_GOOGLE] Callback with URL:', callbackURL);

    // Use type assertion - passport supports callbackURL at authenticate time
    (passport.authenticate as any)('google', {
      session: false,
      failureRedirect: `${dynamicBaseUrl}/login?error=oauth_failed`,
      callbackURL, // Must match the URL used in initial auth
    })(req, res, next);
  },
  async (req: Request, res: Response) => {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'];

    // Get dynamic frontend URL for redirects
    const dynamicFrontendUrl = getDynamicFrontendUrl(req);

    try {
      const user = req.user as any;

      if (!user) {
        console.error('[OAUTH_GOOGLE] No user in callback');
        return res.redirect(`${dynamicFrontendUrl}/login?error=no_user`);
      }

      // Check if this is a pending OAuth signup (new user)
      if (user.isPending) {
        console.log('[OAUTH_GOOGLE] Pending OAuth signup detected for:', user.email);

        // Create a temporary JWT with pending profile (expires in 15 minutes)
        const tempToken = jwt.sign(
          {
            type: 'pending_oauth',
            profile: {
              googleId: user.googleId,
              email: user.email,
              name: user.name,
              avatarUrl: user.avatarUrl,
            },
          },
          process.env.JWT_SECRET!,
          { expiresIn: '15m' }
        );

        // Redirect to OAuth setup page with temp token
        const setupUrl = new URL('/auth/oauth-setup', dynamicFrontendUrl);
        setupUrl.searchParams.set('token', tempToken);

        console.log('[OAUTH_GOOGLE] Redirecting to OAuth setup page');
        return res.redirect(setupUrl.toString());
      }

      // Existing user - continue with normal login flow
      console.log('[OAUTH_GOOGLE] OAuth successful for existing user:', user.email);

      // Update last login
      await updateLastLoginV2(user.id, ipAddress);

      // Log OAuth login event
      await logAuthEventV2({
        userId: user.id,
        eventType: 'login',
        provider: 'google',
        ipAddress,
        userAgent,
        success: true,
      });

      // Generate JWT session
      const session = await createJwtSessionPayload(user as DbUser, {
        deviceInfo: userAgent,
        ipAddress,
      });

      // Encode user profile for frontend (base64)
      const profileBase64 = Buffer.from(JSON.stringify(session.user)).toString('base64');

      // Construct redirect URL to frontend callback
      const redirectUrl = new URL('/auth/callback', dynamicFrontendUrl);
      redirectUrl.searchParams.set('token', session.token);
      redirectUrl.searchParams.set('refreshToken', session.refreshToken);
      redirectUrl.searchParams.set('profile', profileBase64);

      console.log('[OAUTH_GOOGLE] Redirecting to frontend:', redirectUrl.origin + redirectUrl.pathname);

      // Redirect to frontend with tokens
      res.redirect(redirectUrl.toString());
    } catch (error: any) {
      console.error('[OAUTH_GOOGLE] Callback error:', error.message);

      // Log failed OAuth
      await logAuthEventV2({
        eventType: 'login',
        provider: 'google',
        ipAddress,
        userAgent,
        success: false,
        failureReason: error.message,
      });

      res.redirect(`${dynamicFrontendUrl}/login?error=oauth_callback_failed`);
    }
  }
);

/**
 * GET /auth/google/status
 *
 * Check if Google OAuth is configured and available.
 * Useful for frontend to conditionally show "Sign in with Google" button.
 */
router.get('/google/status', (req: Request, res: Response) => {
  const isConfigured = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET
  );

  res.json({
    available: isConfigured,
    provider: 'google',
    message: isConfigured
      ? 'Google OAuth is configured and available'
      : 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment.',
  });
});

/**
 * GET /auth/google/link
 *
 * Initiates Google OAuth linking flow for authenticated users.
 * User must be logged in to link their Google account.
 * Accepts token as query parameter since this is a redirect flow.
 */
router.get(
  '/google/link',
  async (req: Request, res: Response) => {
    // Check if Google OAuth is configured
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error('[OAUTH_GOOGLE] Google OAuth not configured');
      return res.redirect(`${FRONTEND_URL}/profile?error=oauth_not_configured`);
    }

    // Get token from query parameter or authorization header
    const token = req.query.token as string || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      console.error('[OAUTH_GOOGLE] No token provided for linking');
      return res.redirect(`${FRONTEND_URL}/profile?error=no_token`);
    }

    // Verify the JWT token
    let userId: string;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      userId = decoded.userId;
    } catch (e) {
      console.error('[OAUTH_GOOGLE] Invalid token for linking');
      return res.redirect(`${FRONTEND_URL}/profile?error=invalid_token`);
    }

    console.log('[OAUTH_GOOGLE] Initiating account linking for user:', userId);

    // Check if user already has Google linked
    const hasGoogle = await hasGoogleLinkedV2(userId);
    if (hasGoogle) {
      return res.redirect(`${FRONTEND_URL}/profile?error=already_linked`);
    }

    // Create a state token with user ID for linking (JWT for security)
    const stateToken = jwt.sign(
      { type: 'link', userId },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' }
    );

    // Construct Google OAuth URL with state parameter
    const redirectUri = process.env.GOOGLE_LINK_CALLBACK_URL ||
      (process.env.GOOGLE_CALLBACK_URL?.replace('/callback', '/link/callback')) ||
      `${FRONTEND_URL.replace('5173', '5000')}/auth/google/link/callback`;

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', 'profile email');
    googleAuthUrl.searchParams.set('state', stateToken);
    googleAuthUrl.searchParams.set('access_type', 'offline');
    googleAuthUrl.searchParams.set('prompt', 'consent');

    console.log('[OAUTH_GOOGLE] Redirecting to Google for linking');
    return res.redirect(googleAuthUrl.toString());
  }
);

/**
 * GET /auth/google/link/callback
 *
 * Callback for Google OAuth linking flow.
 * Links Google account to the authenticated user.
 */
router.get(
  '/google/link/callback',
  oauthCallbackRateLimiter,
  async (req: Request, res: Response) => {
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'];

    try {
      // Verify state token
      const state = req.query.state as string;
      if (!state) {
        console.error('[OAUTH_GOOGLE] No state in link callback');
        return res.redirect(`${FRONTEND_URL}/profile?error=invalid_state`);
      }

      let stateData: { type: string; userId: string };
      try {
        stateData = jwt.verify(state, process.env.JWT_SECRET!) as any;
      } catch (e) {
        console.error('[OAUTH_GOOGLE] Invalid state token');
        return res.redirect(`${FRONTEND_URL}/profile?error=invalid_state`);
      }

      if (stateData.type !== 'link' || !stateData.userId) {
        console.error('[OAUTH_GOOGLE] Invalid state type');
        return res.redirect(`${FRONTEND_URL}/profile?error=invalid_state`);
      }

      // Get Google profile from callback
      // Note: We need to manually extract the Google profile since passport.authenticate
      // doesn't work well with state verification
      const code = req.query.code as string;
      if (!code) {
        return res.redirect(`${FRONTEND_URL}/profile?error=no_code`);
      }

      // Exchange code for tokens using Google OAuth2 API
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: process.env.GOOGLE_LINK_CALLBACK_URL || `${process.env.GOOGLE_CALLBACK_URL?.replace('/callback', '/link/callback')}`,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        console.error('[OAUTH_GOOGLE] Token exchange failed');
        return res.redirect(`${FRONTEND_URL}/profile?error=token_exchange_failed`);
      }

      const tokens = await tokenResponse.json();

      // Get user info from Google
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        console.error('[OAUTH_GOOGLE] Failed to get user info');
        return res.redirect(`${FRONTEND_URL}/profile?error=failed_to_get_user_info`);
      }

      const googleProfile = await userInfoResponse.json();
      const googleId = googleProfile.id;
      const avatarUrl = googleProfile.picture;

      console.log('[OAUTH_GOOGLE] Linking Google account:', googleId, 'to user:', stateData.userId);

      // Link Google account to user
      await linkGoogleAccountV2(stateData.userId, googleId, avatarUrl);

      // Log the linking event
      await logAuthEventV2({
        userId: stateData.userId,
        eventType: 'oauth_link',
        provider: 'google',
        ipAddress,
        userAgent,
        success: true,
      });

      console.log('[OAUTH_GOOGLE] Successfully linked Google account');
      return res.redirect(`${FRONTEND_URL}/profile?success=google_linked`);
    } catch (error: any) {
      console.error('[OAUTH_GOOGLE] Link callback error:', error.message);
      return res.redirect(`${FRONTEND_URL}/profile?error=link_failed`);
    }
  }
);

/**
 * POST /auth/google/unlink
 *
 * Unlink Google account from the authenticated user.
 * User must have a password set to prevent locking themselves out.
 */
router.post(
  '/google/unlink',
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'];

    try {
      console.log('[OAUTH_GOOGLE] Unlinking Google account for user:', userId);

      // Check if user has Google linked
      const hasGoogle = await hasGoogleLinkedV2(userId);
      if (!hasGoogle) {
        return res.status(400).json({ error: 'No Google account linked' });
      }

      // Unlink Google account
      await unlinkGoogleAccountV2(userId);

      // Log the unlinking event
      await logAuthEventV2({
        userId,
        eventType: 'oauth_unlink',
        provider: 'google',
        ipAddress,
        userAgent,
        success: true,
      });

      console.log('[OAUTH_GOOGLE] Successfully unlinked Google account');
      return res.json({ message: 'Google account unlinked successfully' });
    } catch (error: any) {
      console.error('[OAUTH_GOOGLE] Unlink error:', error.message);

      // Log failure
      await logAuthEventV2({
        userId,
        eventType: 'oauth_unlink',
        provider: 'google',
        ipAddress,
        userAgent,
        success: false,
        failureReason: error.message,
      });

      return res.status(400).json({ error: error.message });
    }
  }
);

/**
 * GET /auth/google/link-status
 *
 * Check if the authenticated user has Google linked.
 */
router.get(
  '/google/link-status',
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;

    try {
      const hasGoogle = await hasGoogleLinkedV2(userId);
      return res.json({ linked: hasGoogle, provider: 'google' });
    } catch (error: any) {
      console.error('[OAUTH_GOOGLE] Link status error:', error.message);
      return res.status(500).json({ error: 'Failed to check link status' });
    }
  }
);

export default router;
