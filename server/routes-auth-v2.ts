/**
 * Authentication Routes V2
 *
 * New secure authentication routes using:
 * - Database-backed user storage (PostgreSQL)
 * - Bcrypt password hashing
 * - JWT tokens with expiration
 * - Session management with revocation
 * - Rate limiting
 * - Security event logging
 *
 * These routes coexist with the old system in server/routes.ts
 */

import { Router, Request, Response } from 'express';
import {
  loginRateLimiter,
  signupRateLimiter,
  tokenRefreshRateLimiter,
  passwordResetRateLimiter,
} from './middleware/rate-limit';
import {
  createPasswordUserV2,
  createOAuthUserV2,
  findUserByIdentifierV2,
  findUserByIdV2,
  findUserByEmailV2,
  updateLastLoginV2,
  logAuthEventV2,
  revokeSessionV2,
  revokeSessionByRefreshTokenV2,
  incrementFailedLoginV2,
  lockUserAccountV2,
  isAccountLockedV2,
  checkUsernameExistsV2,
  updatePhoneNumberV2,
  hasPasswordSetV2,
  sanitizeUserV2,
} from './auth/store-v2';
import { query, queryOne } from './db/auth-connection';
import { verifyPasswordBcrypt, validatePasswordStrength } from './auth/password-bcrypt';
import { createJwtSessionPayload } from './auth/session-jwt';
import { verifyRefreshToken } from './auth/jwt';
import { requireAuth } from './middleware/auth';
import jwt from 'jsonwebtoken';

const router = Router();

/**
 * POST /auth/v2/signup
 *
 * Create a new user account with email, username, and password.
 * Uses bcrypt for password hashing and stores in database.
 */
router.post('/v2/signup', signupRateLimiter, async (req: Request, res: Response) => {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'];

  try {
    const { email, username, password, name, tier, countryOfResidence, dateOfBirth, phoneNumber, termsAccepted } = req.body;

    // Validation
    if (!email || !username || !password) {
      await logAuthEventV2({
        eventType: 'signup',
        provider: 'password',
        ipAddress,
        success: false,
        failureReason: 'Missing required fields',
      });
      return res.status(400).json({ message: 'Missing required fields: email, username, password' });
    }

    // Country of residence validation
    if (!countryOfResidence || typeof countryOfResidence !== 'string' || countryOfResidence.trim().length === 0) {
      return res.status(400).json({ message: 'Country of residence is required' });
    }

    // Date of birth validation
    if (!dateOfBirth) {
      return res.status(400).json({ message: 'Date of birth is required' });
    }
    const dobDate = new Date(dateOfBirth);
    if (isNaN(dobDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date of birth format' });
    }

    // Terms & Conditions validation
    if (!termsAccepted) {
      return res.status(400).json({ message: 'You must accept the terms and conditions' });
    }

    // Phone number validation
    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
      return res.status(400).json({ message: 'Phone number is required' });
    }
    // E.164 format validation (e.g., +919876543210)
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!phoneRegex.test(normalizedPhone)) {
      return res.status(400).json({ message: 'Invalid phone number format. Use international format (e.g., +919876543210)' });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Username length validation
    if (username.length < 3) {
      return res.status(400).json({ message: 'Username must be at least 3 characters long' });
    }

    // Password strength validation
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ message: passwordValidation.message });
    }

    // Create user in database
    const user = await createPasswordUserV2({
      email,
      username,
      password,
      name: name || username,
      tier: 'premium', // Default all users to premium until payment is implemented
      countryOfResidence: countryOfResidence.trim(),
      dateOfBirth: dateOfBirth, // ISO format: YYYY-MM-DD
      phoneNumber: normalizedPhone,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: '1.0',
    });

    // Log successful signup
    await logAuthEventV2({
      userId: user.id,
      eventType: 'signup',
      provider: 'password',
      ipAddress,
      userAgent,
      success: true,
    });

    // Send welcome email (non-blocking)
    sendWelcomeEmail({
      to: user.email,
      userName: user.name || user.username,
    }).then((result) => {
      if (result.success) {
        console.log('[AUTH_V2] Welcome email sent via', result.provider, 'to', user.email);
      } else {
        console.error('[AUTH_V2] Failed to send welcome email:', result.error);
      }
    }).catch((err) => {
      console.error('[AUTH_V2] Welcome email error:', err.message);
    });

    // Generate JWT session
    const session = await createJwtSessionPayload(user, {
      deviceInfo: userAgent,
      ipAddress,
    });

    res.status(201).json(session);
  } catch (error: any) {
    console.error('[AUTH_V2] Signup error:', error.message);

    // Log failed signup
    await logAuthEventV2({
      eventType: 'signup',
      provider: 'password',
      ipAddress,
      userAgent,
      success: false,
      failureReason: error.message,
    });

    // Return appropriate error message
    if (error.message.includes('email already exists') || error.message.includes('username is already taken')) {
      return res.status(409).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to create account. Please try again.' });
  }
});

/**
 * POST /auth/v2/login
 *
 * Login with email/username and password.
 * Supports account lockout after failed attempts.
 */
router.post('/v2/login', loginRateLimiter, async (req: Request, res: Response) => {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'];

  try {
    const { identifier, password } = req.body;

    // Validation
    if (!identifier || !password) {
      return res.status(400).json({ message: 'Missing credentials: identifier and password required' });
    }

    // Find user by email or username
    const user = await findUserByIdentifierV2(identifier);

    if (!user) {
      // Log failed attempt (no user found)
      await logAuthEventV2({
        eventType: 'failed_login',
        provider: 'password',
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'User not found',
        metadata: { identifier },
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if account is locked
    if (await isAccountLockedV2(user.id)) {
      await logAuthEventV2({
        userId: user.id,
        eventType: 'failed_login',
        provider: 'password',
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Account locked',
      });
      return res.status(423).json({
        message: 'Account temporarily locked due to multiple failed login attempts. Please try again later.',
        code: 'ACCOUNT_LOCKED',
      });
    }

    // Check if user is password-based
    if (user.provider !== 'password' || !user.password_hash) {
      await logAuthEventV2({
        userId: user.id,
        eventType: 'failed_login',
        provider: 'password',
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Not a password user',
      });
      return res.status(401).json({
        message: 'This account uses OAuth authentication. Please sign in with Google.',
      });
    }

    // Verify password
    const isPasswordValid = await verifyPasswordBcrypt(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment failed attempts
      const failedAttempts = await incrementFailedLoginV2(user.id);

      // Lock account after 5 failed attempts
      if (failedAttempts >= 5) {
        await lockUserAccountV2(user.id, 30); // Lock for 30 minutes
        await logAuthEventV2({
          userId: user.id,
          eventType: 'account_locked',
          provider: 'password',
          ipAddress,
          userAgent,
          success: false,
          metadata: { failedAttempts },
        });
        return res.status(423).json({
          message: 'Account locked due to multiple failed login attempts. Please try again in 30 minutes.',
          code: 'ACCOUNT_LOCKED',
        });
      }

      // Log failed login
      await logAuthEventV2({
        userId: user.id,
        eventType: 'failed_login',
        provider: 'password',
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Invalid password',
        metadata: { failedAttempts },
      });

      return res.status(401).json({
        message: `Invalid credentials. ${5 - failedAttempts} attempts remaining before account lockout.`,
      });
    }

    // Check if account is active
    if (!user.is_active) {
      await logAuthEventV2({
        userId: user.id,
        eventType: 'failed_login',
        provider: 'password',
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'Account deactivated',
      });
      return res.status(403).json({ message: 'Account deactivated. Please contact support.' });
    }

    // Success! Update last login
    await updateLastLoginV2(user.id, ipAddress);

    // Log successful login
    await logAuthEventV2({
      userId: user.id,
      eventType: 'login',
      provider: 'password',
      ipAddress,
      userAgent,
      success: true,
    });

    // Generate JWT session
    const session = await createJwtSessionPayload(user, {
      deviceInfo: userAgent,
      ipAddress,
    });

    res.json(session);
  } catch (error: any) {
    console.error('[AUTH_V2] Login error:', error.message);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
});

/**
 * POST /auth/v2/logout
 *
 * Logout and revoke current session.
 * Requires authentication.
 */
router.post('/v2/logout', requireAuth, async (req: Request, res: Response) => {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'];

  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Revoke session
      await revokeSessionV2(token, 'logout');

      // Log logout event
      if (req.user) {
        await logAuthEventV2({
          userId: req.user.userId,
          eventType: 'logout',
          provider: req.user.provider,
          ipAddress,
          userAgent,
          success: true,
        });
      }
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('[AUTH_V2] Logout error:', error.message);
    res.status(500).json({ message: 'Logout failed' });
  }
});

/**
 * POST /auth/v2/refresh
 *
 * Refresh access token using refresh token.
 * Returns a new access token and refresh token.
 */
router.post('/v2/refresh', tokenRefreshRateLimiter, async (req: Request, res: Response) => {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'];

  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token required' });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error: any) {
      return res.status(401).json({
        message: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    // Find user
    const user = await findUserByIdV2(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'Account deactivated' });
    }

    // Revoke old session before creating new one
    // This prevents duplicate session issues if multiple refreshes happen concurrently
    await revokeSessionByRefreshTokenV2(refreshToken, 'token_refresh');

    // Log token refresh
    await logAuthEventV2({
      userId: user.id,
      eventType: 'token_refresh',
      provider: user.provider,
      ipAddress,
      userAgent,
      success: true,
    });

    // Generate new session
    const session = await createJwtSessionPayload(user, {
      deviceInfo: userAgent,
      ipAddress,
    });

    res.json(session);
  } catch (error: any) {
    console.error('[AUTH_V2] Token refresh error:', error.message);
    res.status(500).json({ message: 'Token refresh failed' });
  }
});

/**
 * GET /auth/v2/me
 *
 * Get current authenticated user's profile.
 * Requires authentication.
 */
router.get('/v2/me', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Fetch fresh user data from database
    const user = await findUserByIdV2(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return public profile
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      avatarUrl: user.avatar_url,
      provider: user.provider,
      tier: user.tier,
      role: user.role || 'user',
      emailVerified: user.email_verified,
      countryOfResidence: user.country_of_residence,
      dateOfBirth: user.date_of_birth ? user.date_of_birth.toISOString().split('T')[0] : null,
      lastLoginAt: user.last_login_at,
      loginCount: user.login_count,
      createdAt: user.created_at,
    });
  } catch (error: any) {
    console.error('[AUTH_V2] Get profile error:', error.message);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

/**
 * GET /auth/v2/check-username/:username
 *
 * Check if username is available for registration.
 * Returns availability status and suggestion if taken.
 */
router.get('/v2/check-username/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    // Validation
    if (!username || username.length < 3) {
      return res.status(400).json({
        available: false,
        reason: 'Username must be at least 3 characters',
      });
    }

    // Check availability
    const exists = await checkUsernameExistsV2(username);

    if (exists) {
      // Generate suggestion
      const suggestion = await generateUsernameSuggestion(username);
      return res.json({
        available: false,
        reason: 'Username already taken',
        suggestion,
      });
    }

    return res.json({ available: true });
  } catch (error: any) {
    console.error('[AUTH_V2] Check username error:', error.message);
    return res.status(500).json({ error: 'Failed to check username' });
  }
});

/**
 * Helper function to generate username suggestions
 */
async function generateUsernameSuggestion(username: string): Promise<string> {
  // Try adding random numbers
  for (let i = 0; i < 5; i++) {
    const suffix = Math.floor(Math.random() * 9999);
    const suggestion = `${username}${suffix}`;
    const exists = await checkUsernameExistsV2(suggestion);
    if (!exists) return suggestion;
  }
  // Fallback: timestamp-based unique suffix
  return `${username}_${Date.now().toString(36)}`;
}

/**
 * POST /auth/v2/complete-oauth-signup
 *
 * Complete OAuth signup with username, tier, and T&C acceptance.
 * Creates user account after initial OAuth authentication.
 */
router.post('/v2/complete-oauth-signup', async (req: Request, res: Response) => {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'];

  try {
    const { tempToken, username, tier, countryOfResidence, dateOfBirth, phoneNumber, termsAccepted } = req.body;

    // Validate temp token
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET!);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    if (decoded.type !== 'pending_oauth') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    // Validate inputs
    if (!username || username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (!['basic', 'premium'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier selection' });
    }

    // Country of residence validation
    if (!countryOfResidence || typeof countryOfResidence !== 'string' || countryOfResidence.trim().length === 0) {
      return res.status(400).json({ error: 'Country of residence is required' });
    }

    // Date of birth validation
    if (!dateOfBirth) {
      return res.status(400).json({ error: 'Date of birth is required' });
    }
    const dobDate = new Date(dateOfBirth);
    if (isNaN(dobDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date of birth format' });
    }

    if (!termsAccepted) {
      return res.status(400).json({ error: 'You must accept the terms and conditions' });
    }

    // Phone number validation
    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    // E.164 format validation (e.g., +919876543210)
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!phoneRegex.test(normalizedPhone)) {
      return res.status(400).json({ error: 'Invalid phone number format. Use international format (e.g., +919876543210)' });
    }

    // Check username availability
    const usernameExists = await checkUsernameExistsV2(username);
    if (usernameExists) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Create OAuth user with selected options
    const user = await createOAuthUserV2({
      email: decoded.profile.email,
      username: username,
      name: decoded.profile.name,
      googleId: decoded.profile.googleId,
      avatarUrl: decoded.profile.avatarUrl,
      tier: tier,
      countryOfResidence: countryOfResidence.trim(),
      dateOfBirth: dateOfBirth, // ISO format: YYYY-MM-DD
      phoneNumber: normalizedPhone,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: '1.0',
    });

    // Create session
    const session = await createJwtSessionPayload(user, {
      deviceInfo: userAgent,
      ipAddress,
    });

    // Log successful OAuth signup
    await logAuthEventV2({
      userId: user.id,
      eventType: 'signup',
      provider: 'google',
      ipAddress,
      userAgent,
      success: true,
      metadata: { tier, username },
    });

    // Send welcome email (non-blocking) - imported at top of PASSWORD RESET section
    // Note: sendWelcomeEmail is dynamically imported, so we use a dynamic import here
    import('./lib/email').then(({ sendWelcomeEmail: sendWelcome }) => {
      sendWelcome({
        to: user.email,
        userName: user.name || user.username,
      }).then((result) => {
        if (result.success) {
          console.log('[AUTH_V2] Welcome email sent via', result.provider, 'to', user.email);
        } else {
          console.error('[AUTH_V2] Failed to send welcome email:', result.error);
        }
      }).catch((err: any) => {
        console.error('[AUTH_V2] Welcome email error:', err.message);
      });
    });

    console.log('[AUTH_V2] OAuth signup completed for:', user.email);

    return res.json(session);
  } catch (error: any) {
    console.error('[AUTH_V2] Complete OAuth signup error:', error.message);

    // Log failed signup
    await logAuthEventV2({
      eventType: 'signup',
      provider: 'google',
      ipAddress,
      userAgent,
      success: false,
      failureReason: error.message,
    });

    return res.status(500).json({ error: 'Failed to complete signup' });
  }
});

// ============================================================================
// PASSWORD RESET ROUTES
// ============================================================================

import { createOTP, verifyOTP, OTP_CONFIG } from './lib/otp';
import { hashPasswordBcrypt } from './auth/password-bcrypt';
import {
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendAccountDeletionEmail,
  sendWelcomeEmail,
  isEmailConfigured,
} from './lib/email';

/**
 * POST /auth/v2/forgot-password
 * Request a password reset OTP
 * Rate limited: 3 requests per hour per IP
 */
router.post('/v2/forgot-password', passwordResetRateLimiter, async (req, res) => {
  const { email } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Find user by email
    const user = await findUserByEmailV2(email.toLowerCase().trim());

    // Always return success to prevent email enumeration
    if (!user) {
      console.log('[AUTH_V2] Password reset requested for non-existent email:', email);
      return res.json({
        message: 'If an account exists with this email, a reset code has been sent.',
        expiresInMinutes: OTP_CONFIG.expiryMinutes,
      });
    }

    // Check if user is a Google-only user
    if (user.provider === 'google' && !user.password_hash) {
      console.log('[AUTH_V2] Password reset attempted for Google-only user:', email);
      return res.json({
        message: 'If an account exists with this email, a reset code has been sent.',
        expiresInMinutes: OTP_CONFIG.expiryMinutes,
      });
    }

    // Create OTP
    const otp = await createOTP(user.id, user.email, 'password_reset');

    // Log the event
    await logAuthEventV2({
      userId: user.id,
      eventType: 'password_reset_requested',
      provider: user.provider,
      ipAddress,
      userAgent,
      success: true,
    });

    // Send password reset email
    const emailResult = await sendPasswordResetEmail({
      to: user.email,
      otp,
      expiryMinutes: OTP_CONFIG.expiryMinutes,
      userName: user.name || user.username,
    });

    if (!emailResult.success) {
      console.error('[AUTH_V2] Failed to send password reset email:', emailResult.error);
      // Still return success to prevent email enumeration
    } else {
      console.log('[AUTH_V2] Password reset email sent via', emailResult.provider, 'to', email);
    }

    // In development, log OTP for testing
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AUTH_V2] Password reset OTP for', email, ':', otp);
    }

    return res.json({
      message: 'If an account exists with this email, a reset code has been sent.',
      expiresInMinutes: OTP_CONFIG.expiryMinutes,
      // Include OTP in response for development only

    });
  } catch (error: any) {
    console.error('[AUTH_V2] Forgot password error:', error.message);
    return res.status(500).json({ error: 'Failed to process request' });
  }
});

/**
 * POST /auth/v2/reset-password
 * Verify OTP and set new password
 */
router.post('/v2/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'Email, OTP, and new password are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    // Verify OTP
    const result = await verifyOTP(email.toLowerCase().trim(), otp, 'password_reset');

    if (!result.valid) {
      await logAuthEventV2({
        eventType: 'password_reset_failed',
        provider: 'password',
        ipAddress,
        userAgent,
        success: false,
        failureReason: result.error,
        metadata: { email },
      });
      return res.status(400).json({ error: result.error });
    }

    // Hash new password
    const passwordHash = await hashPasswordBcrypt(newPassword);

    // Update password
    await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, result.userId]
    );

    // Revoke all existing sessions for security
    await query(
      `UPDATE sessions SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'password_reset'
       WHERE user_id = $1 AND revoked = FALSE`,
      [result.userId]
    );

    // Log success
    await logAuthEventV2({
      userId: result.userId,
      eventType: 'password_reset_completed',
      provider: 'password',
      ipAddress,
      userAgent,
      success: true,
    });

    return res.json({ message: 'Password reset successfully. Please log in with your new password.' });
  } catch (error: any) {
    console.error('[AUTH_V2] Reset password error:', error.message);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ============================================================================
// EMAIL VERIFICATION ROUTES
// ============================================================================

/**
 * POST /auth/v2/send-verification
 * Send email verification OTP
 */
router.post('/v2/send-verification', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const userEmail = req.user!.email;
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  try {
    // Check if already verified
    const user = await findUserByIdV2(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Create OTP
    const otp = await createOTP(userId, userEmail, 'email_verification');

    // Log the event
    await logAuthEventV2({
      userId,
      eventType: 'email_verification_requested',
      provider: user.provider,
      ipAddress,
      userAgent,
      success: true,
    });

    // Send email verification email
    const emailResult = await sendEmailVerificationEmail({
      to: userEmail,
      otp,
      expiryMinutes: OTP_CONFIG.expiryMinutes,
      userName: user.name || user.username,
    });

    if (!emailResult.success) {
      console.error('[AUTH_V2] Failed to send verification email:', emailResult.error);
    } else {
      console.log('[AUTH_V2] Verification email sent via', emailResult.provider, 'to', userEmail);
    }

    // In development, log OTP for testing
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AUTH_V2] Email verification OTP for', userEmail, ':', otp);
    }

    return res.json({
      message: 'Verification code sent to your email.',
      expiresInMinutes: OTP_CONFIG.expiryMinutes,

    });
  } catch (error: any) {
    console.error('[AUTH_V2] Send verification error:', error.message);
    return res.status(500).json({ error: 'Failed to send verification code' });
  }
});

/**
 * POST /auth/v2/verify-email
 * Verify email with OTP
 */
router.post('/v2/verify-email', requireAuth, async (req: Request, res: Response) => {
  const { otp } = req.body;
  const userId = req.user!.userId;
  const userEmail = req.user!.email;
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  if (!otp) {
    return res.status(400).json({ error: 'Verification code is required' });
  }

  try {
    // Verify OTP
    const result = await verifyOTP(userEmail, otp, 'email_verification');

    if (!result.valid) {
      await logAuthEventV2({
        userId,
        eventType: 'email_verification_failed',
        provider: req.user!.provider,
        ipAddress,
        userAgent,
        success: false,
        failureReason: result.error,
      });
      return res.status(400).json({ error: result.error });
    }

    // Mark email as verified
    await query(
      `UPDATE users SET email_verified = TRUE, email_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    // Log success
    await logAuthEventV2({
      userId,
      eventType: 'email_verified',
      provider: req.user!.provider,
      ipAddress,
      userAgent,
      success: true,
    });

    return res.json({ message: 'Email verified successfully' });
  } catch (error: any) {
    console.error('[AUTH_V2] Verify email error:', error.message);
    return res.status(500).json({ error: 'Failed to verify email' });
  }
});

// ============================================================================
// SESSIONS MANAGEMENT ROUTES
// ============================================================================

/**
 * GET /auth/v2/sessions
 * Get all active sessions for the current user
 */
router.get('/v2/sessions', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const result = await query(
      `SELECT id, device_info, ip_address, location, issued_at, expires_at, last_activity_at,
              CASE WHEN token_hash = $2 THEN TRUE ELSE FALSE END as is_current
       FROM sessions
       WHERE user_id = $1 AND revoked = FALSE AND expires_at > NOW()
       ORDER BY last_activity_at DESC`,
      [userId, req.headers.authorization?.replace('Bearer ', '')]
    );

    // Parse device info if JSON
    const sessions = result.rows.map((session: any) => ({
      id: session.id,
      deviceInfo: session.device_info,
      ipAddress: session.ip_address,
      location: session.location,
      issuedAt: session.issued_at,
      expiresAt: session.expires_at,
      lastActivityAt: session.last_activity_at,
      isCurrent: session.is_current,
    }));

    return res.json({ sessions });
  } catch (error: any) {
    console.error('[AUTH_V2] Get sessions error:', error.message);
    return res.status(500).json({ error: 'Failed to get sessions' });
  }
});

/**
 * DELETE /auth/v2/sessions/:id
 * Revoke a specific session
 */
router.delete('/v2/sessions/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const sessionId = req.params.id;
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  try {
    // Verify session belongs to user
    const session = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM sessions WHERE id = $1',
      [sessionId]
    );

    if (!session || session.user_id !== userId) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Revoke session
    await query(
      `UPDATE sessions SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'user_revoked'
       WHERE id = $1`,
      [sessionId]
    );

    // Log event
    await logAuthEventV2({
      userId,
      eventType: 'session_revoked',
      provider: req.user!.provider,
      ipAddress,
      userAgent,
      success: true,
      metadata: { revokedSessionId: sessionId },
    });

    return res.json({ message: 'Session revoked successfully' });
  } catch (error: any) {
    console.error('[AUTH_V2] Revoke session error:', error.message);
    return res.status(500).json({ error: 'Failed to revoke session' });
  }
});

/**
 * DELETE /auth/v2/sessions
 * Revoke all sessions except current
 */
router.delete('/v2/sessions', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const currentToken = req.headers.authorization?.replace('Bearer ', '');
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  try {
    // Get current session token hash
    const currentTokenHash = currentToken
      ? require('crypto').createHash('sha256').update(currentToken).digest('hex')
      : null;

    // Revoke all sessions except current
    const result = await query(
      `UPDATE sessions
       SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'user_revoked_all'
       WHERE user_id = $1 AND revoked = FALSE AND token_hash != $2`,
      [userId, currentTokenHash]
    );

    // Log event
    await logAuthEventV2({
      userId,
      eventType: 'all_sessions_revoked',
      provider: req.user!.provider,
      ipAddress,
      userAgent,
      success: true,
      metadata: { sessionsRevoked: result.rowCount },
    });

    return res.json({
      message: 'All other sessions revoked',
      sessionsRevoked: result.rowCount,
    });
  } catch (error: any) {
    console.error('[AUTH_V2] Revoke all sessions error:', error.message);
    return res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

// ============================================================================
// PROFILE UPDATE ROUTES
// ============================================================================

/**
 * POST /auth/v2/update-phone
 * Update user's phone number
 */
router.post('/v2/update-phone', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  try {
    const { phoneNumber } = req.body;

    // Phone number validation
    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // E.164 format validation (e.g., +919876543210)
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!phoneRegex.test(normalizedPhone)) {
      return res.status(400).json({ error: 'Invalid phone number format. Use international format (e.g., +919876543210)' });
    }

    // Update phone number (resets phone_verified to false)
    const user = await updatePhoneNumberV2(userId, normalizedPhone);

    // Log the event
    await logAuthEventV2({
      userId,
      eventType: 'profile_update',
      provider: 'password',
      ipAddress,
      userAgent,
      success: true,
      metadata: { field: 'phone_number' },
    });

    return res.json({
      message: 'Phone number updated successfully',
      user: sanitizeUserV2(user),
    });
  } catch (error: any) {
    console.error('[AUTH_V2] Update phone error:', error.message);
    return res.status(500).json({ error: 'Failed to update phone number' });
  }
});

/**
 * GET /auth/v2/has-password
 * Check if user has a password set (for OAuth users)
 */
router.get('/v2/has-password', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const hasPassword = await hasPasswordSetV2(userId);
    return res.json({ hasPassword });
  } catch (error: any) {
    console.error('[AUTH_V2] Has password check error:', error.message);
    return res.status(500).json({ error: 'Failed to check password status' });
  }
});

// ============================================================================
// ACCOUNT DELETION ROUTES
// ============================================================================

/**
 * POST /auth/v2/request-deletion
 * Request account deletion OTP
 */
router.post('/v2/request-deletion', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const userEmail = req.user!.email;
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  try {
    // Create OTP
    const otp = await createOTP(userId, userEmail, 'account_deletion');

    // Log the event
    await logAuthEventV2({
      userId,
      eventType: 'account_deletion_requested',
      provider: req.user!.provider,
      ipAddress,
      userAgent,
      success: true,
    });

    // Get user details for email
    const user = await findUserByIdV2(userId);

    // Send account deletion confirmation email
    const emailResult = await sendAccountDeletionEmail({
      to: userEmail,
      otp,
      expiryMinutes: OTP_CONFIG.expiryMinutes,
      userName: user?.name || user?.username,
    });

    if (!emailResult.success) {
      console.error('[AUTH_V2] Failed to send deletion email:', emailResult.error);
    } else {
      console.log('[AUTH_V2] Deletion email sent via', emailResult.provider, 'to', userEmail);
    }

    // In development, log OTP for testing
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AUTH_V2] Account deletion OTP for', userEmail, ':', otp);
    }

    return res.json({
      message: 'Deletion confirmation code sent to your email.',
      expiresInMinutes: OTP_CONFIG.expiryMinutes,

    });
  } catch (error: any) {
    console.error('[AUTH_V2] Request deletion error:', error.message);
    return res.status(500).json({ error: 'Failed to request deletion' });
  }
});

/**
 * GET /auth/v2/export-my-data
 * Export user's data (GDPR compliance)
 */
router.get('/v2/export-my-data', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    // Get user data
    const user = await findUserByIdV2(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get sessions
    const sessions = await query(
      `SELECT device_info, ip_address, location, issued_at, expires_at, last_activity_at, revoked
       FROM sessions WHERE user_id = $1 ORDER BY issued_at DESC LIMIT 100`,
      [userId]
    );

    // Get auth logs
    const authLogs = await query(
      `SELECT event_type, provider, ip_address, success, created_at
       FROM auth_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId]
    );

    // Get privacy consent history
    const consentHistory = await query(
      `SELECT consent_level, ip_address, created_at
       FROM privacy_consent WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    // Compile data export
    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        provider: user.provider,
        tier: user.tier,
        role: user.role,
        emailVerified: user.email_verified,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
        loginCount: user.login_count,
      },
      sessions: sessions.rows,
      authLogs: authLogs.rows,
      consentHistory: consentHistory.rows,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="tiphub-data-export-${userId}.json"`);
    return res.json(exportData);
  } catch (error: any) {
    console.error('[AUTH_V2] Export data error:', error.message);
    return res.status(500).json({ error: 'Failed to export data' });
  }
});

/**
 * POST /auth/v2/delete-account
 * Delete account after OTP verification
 */
router.post('/v2/delete-account', requireAuth, async (req: Request, res: Response) => {
  const { otp } = req.body;
  const userId = req.user!.userId;
  const userEmail = req.user!.email;
  const ipAddress = req.ip;
  const userAgent = req.get('user-agent');

  if (!otp) {
    return res.status(400).json({ error: 'Confirmation code is required' });
  }

  try {
    // Verify OTP
    const result = await verifyOTP(userEmail, otp, 'account_deletion');

    if (!result.valid) {
      await logAuthEventV2({
        userId,
        eventType: 'account_deletion_failed',
        provider: req.user!.provider,
        ipAddress,
        userAgent,
        success: false,
        failureReason: result.error,
      });
      return res.status(400).json({ error: result.error });
    }

    // Log before deletion
    await logAuthEventV2({
      userId,
      eventType: 'account_deleted',
      provider: req.user!.provider,
      ipAddress,
      userAgent,
      success: true,
      metadata: { email: userEmail },
    });

    // Revoke all sessions
    await query(
      `UPDATE sessions SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'account_deleted'
       WHERE user_id = $1`,
      [userId]
    );

    // Delete user data (cascading deletes should handle related records)
    // First delete from tables with foreign keys
    await query('DELETE FROM notification_dismissals WHERE user_id = $1', [userId]);
    await query('DELETE FROM privacy_consent WHERE user_id = $1', [userId]);
    await query('DELETE FROM otp_codes WHERE user_id = $1', [userId]);
    await query('DELETE FROM oauth_accounts WHERE user_id = $1', [userId]);
    await query('DELETE FROM sessions WHERE user_id = $1', [userId]);

    // Finally delete the user (keep auth_logs for audit trail but anonymize)
    await query(
      `UPDATE auth_logs SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{deleted}', 'true')
       WHERE user_id = $1`,
      [userId]
    );

    // Delete user record
    await query('DELETE FROM users WHERE id = $1', [userId]);

    return res.json({ message: 'Account deleted successfully' });
  } catch (error: any) {
    console.error('[AUTH_V2] Delete account error:', error.message);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ============================================================================
// RATE LIMIT DISPLAY ROUTE
// ============================================================================

/**
 * GET /auth/v2/usage-limits
 * Get user's current usage and limits (for rate limiting display)
 */
router.get('/v2/usage-limits', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const userTier = req.user!.tier;

  try {
    // 1. Check for user-specific overrides first
    const overridesResult = await query(
      `SELECT endpoint_key, max_requests, window_ms
       FROM rate_limit_overrides
       WHERE user_id = $1
         AND (expires_at IS NULL OR expires_at > NOW())
         AND endpoint_key IN ('api_screener', 'api_backtest')`,
      [userId]
    );

    const overrides: Record<string, { maxRequests: number; windowMs: number }> = {};
    overridesResult.rows.forEach((row: any) => {
      overrides[row.endpoint_key] = {
        maxRequests: parseInt(row.max_requests),
        windowMs: parseInt(row.window_ms)
      };
    });

    // 2. Get tier-based limits from rate_limit_configs
    const configsResult = await query(
      `SELECT endpoint_key, max_requests, window_ms
       FROM rate_limit_configs
       WHERE tier = $1
         AND is_active = true
         AND endpoint_key IN ('api_screener', 'api_backtest')`,
      [userTier]
    );

    // Build limits (defaults < tier config < override)
    const defaultLimits: Record<string, { maxRequests: number; windowMs: number }> = {
      api_screener: { maxRequests: userTier === 'premium' ? 50 : 3, windowMs: 3600000 },
      api_backtest: { maxRequests: userTier === 'premium' ? 20 : 2, windowMs: 3600000 }
    };

    const configs: Record<string, { maxRequests: number; windowMs: number }> = { ...defaultLimits };
    configsResult.rows.forEach((row: any) => {
      configs[row.endpoint_key] = {
        maxRequests: parseInt(row.max_requests),
        windowMs: parseInt(row.window_ms)
      };
    });

    // Apply overrides (highest priority)
    Object.assign(configs, overrides);

    const screenerLimit = configs['api_screener'];
    const backtestLimit = configs['api_backtest'];

    // 3. Get usage based on window_ms from config
    const screenerWindowStart = new Date(Date.now() - screenerLimit.windowMs);
    const backtestWindowStart = new Date(Date.now() - backtestLimit.windowMs);

    const usageResult = await query(
      `SELECT
         COUNT(*) FILTER (WHERE feature_type = 'screener' AND created_at > $2) as screener_count,
         COUNT(*) FILTER (WHERE feature_type = 'backtest' AND created_at > $3) as backtest_count
       FROM feature_usage
       WHERE user_id = $1`,
      [userId, screenerWindowStart, backtestWindowStart]
    );

    const screenerUsage = parseInt(usageResult.rows[0]?.screener_count || '0');
    const backtestUsage = parseInt(usageResult.rows[0]?.backtest_count || '0');

    return res.json({
      tier: userTier,
      limits: {
        screenerRunsPerHour: screenerLimit.maxRequests,
        backtestRunsPerHour: backtestLimit.maxRequests,
      },
      usage: {
        screenerRuns: screenerUsage,
        backtestRuns: backtestUsage,
      },
      remaining: {
        screenerRuns: Math.max(0, screenerLimit.maxRequests - screenerUsage),
        backtestRuns: Math.max(0, backtestLimit.maxRequests - backtestUsage),
      },
      resetsAt: new Date(Math.ceil(Date.now() / screenerLimit.windowMs) * screenerLimit.windowMs).toISOString(),
    });
  } catch (error: any) {
    console.error('[AUTH_V2] Get usage limits error:', error.message);
    return res.status(500).json({ error: 'Failed to get usage limits' });
  }
});

export default router;
