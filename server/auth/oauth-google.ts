/**
 * Google OAuth Strategy
 *
 * Configures Passport for Google OAuth 2.0 authentication.
 * Handles:
 * - New user creation
 * - Existing user login
 * - Account linking (same email)
 */

import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import {
  createOAuthUserV2,
  findUserByGoogleIdV2,
  findUserByEmailV2,
  linkGoogleAccountV2,
} from './store-v2';

// Get OAuth configuration from environment
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// Support both GOOGLE_CALLBACK_URL_PROD and GOOGLE_CALLBACK_URL for flexibility
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL_PROD ||
  process.env.GOOGLE_CALLBACK_URL ||
  'http://localhost:5000/auth/google/callback';

// Validate configuration
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('[OAUTH_GOOGLE] ⚠️  WARNING: Google OAuth credentials not configured!');
  console.warn('[OAUTH_GOOGLE] Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment');
  console.warn('[OAUTH_GOOGLE] Google OAuth will not work until configured');
} else {
  console.log('[OAUTH_GOOGLE] ✓ Google OAuth configured');
  console.log('[OAUTH_GOOGLE] Client ID:', GOOGLE_CLIENT_ID.substring(0, 20) + '...');
  console.log('[OAUTH_GOOGLE] Callback URL:', GOOGLE_CALLBACK_URL);
}

/**
 * Configure Google OAuth Strategy
 */
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email'],
        passReqToCallback: false,
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: VerifyCallback
      ) => {
        try {
          console.log('[OAUTH_GOOGLE] OAuth callback received for user:', profile.emails?.[0]?.value);

          // Extract user data from Google profile
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName;
          const avatarUrl = profile.photos?.[0]?.value;

          if (!email) {
            console.error('[OAUTH_GOOGLE] No email provided by Google');
            return done(new Error('No email provided by Google'), undefined);
          }

          // Step 1: Check if user exists by Google ID
          let user = await findUserByGoogleIdV2(googleId);

          if (user) {
            console.log('[OAUTH_GOOGLE] Found existing user by Google ID:', user.email);
            return done(null, user as any);
          }

          // Step 2: Check if user exists by email (for account linking)
          user = await findUserByEmailV2(email);

          if (user) {
            // Account with same email exists - link Google account
            console.log('[OAUTH_GOOGLE] Linking Google account to existing user:', user.email);

            // Only link if account is not already linked to a different OAuth provider
            if (user.google_id) {
              console.error('[OAUTH_GOOGLE] Email already linked to different Google account');
              return done(new Error('Email already linked to a different Google account'), undefined);
            }

            // Link Google ID to existing account
            user = await linkGoogleAccountV2(user.id, googleId, avatarUrl);
            console.log('[OAUTH_GOOGLE] Successfully linked Google account');
            return done(null, user as any);
          }

          // Step 3: New user - return pending profile for frontend to complete signup
          console.log('[OAUTH_GOOGLE] New user detected, returning pending profile for:', email);

          // Return a special pending user object with isPending flag
          // This will be caught in the callback route and redirected to OAuth setup page
          const pendingUser = {
            isPending: true,
            googleId,
            email,
            name: name || email.split('@')[0],
            avatarUrl,
          };

          console.log('[OAUTH_GOOGLE] Returning pending profile for OAuth setup');
          return done(null, pendingUser as any);
        } catch (error: any) {
          console.error('[OAUTH_GOOGLE] Error in OAuth callback:', error.message);
          return done(error, undefined);
        }
      }
    )
  );

  // Passport serialization (not used since we're using JWT)
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser((id: string, done) => {
    // Not used in JWT auth, but required by Passport
    done(null, { id } as any);
  });
}

export default passport;
