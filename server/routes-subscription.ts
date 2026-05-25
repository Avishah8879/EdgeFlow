/**
 * Subscription Routes
 *
 * API endpoints for subscription management:
 * - Get available plans
 * - Get user subscription status
 * - Start free trial
 * - Cancel subscription
 * - View subscription history
 *
 * All endpoints require authentication (except GET /plans)
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from './middleware/auth';
import {
  getSubscriptionPlans,
  getPlanById,
  getUserSubscription,
  checkTrialEligibility,
  startTrial,
  cancelSubscription,
  downgradeToBasic,
  getSubscriptionHistory,
  expireEndedTrials,
  expireEndedSubscriptions,
} from './db/subscription-store';

const router = Router();

/**
 * GET /api/subscription/plans
 *
 * Get all active subscription plans.
 * Public endpoint - no authentication required.
 */
router.get('/plans', async (req: Request, res: Response) => {
  try {
    const plans = await getSubscriptionPlans();

    // Format for frontend consumption
    const formattedPlans = plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      tier: plan.tier,
      price: plan.price_cents / 100, // Convert to rupees
      priceCents: plan.price_cents,
      currency: plan.currency,
      billingInterval: plan.billing_interval,
      intervalCount: plan.interval_count,
      trialDays: plan.trial_days,
      features: plan.features,
      isActive: plan.is_active,
      sortOrder: plan.sort_order,
    }));

    res.json({ data: formattedPlans, meta: { count: formattedPlans.length } });
  } catch (error: any) {
    console.error('[SUBSCRIPTION] Get plans error:', error.message);
    res.status(500).json({ error: { code: 'PLANS_FETCH_FAILED', message: 'Failed to fetch subscription plans' } });
  }
});

/**
 * GET /api/subscription/plan/:planId
 *
 * Get a specific subscription plan by ID.
 * Public endpoint - no authentication required.
 */
router.get('/plan/:planId', async (req: Request, res: Response) => {
  try {
    const { planId } = req.params;
    const plan = await getPlanById(planId);

    if (!plan) {
      return res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'Plan not found' } });
    }

    res.json({ data: {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      tier: plan.tier,
      price: plan.price_cents / 100,
      priceCents: plan.price_cents,
      currency: plan.currency,
      billingInterval: plan.billing_interval,
      intervalCount: plan.interval_count,
      trialDays: plan.trial_days,
      features: plan.features,
      isActive: plan.is_active,
    } });
  } catch (error: any) {
    console.error('[SUBSCRIPTION] Get plan error:', error.message);
    res.status(500).json({ error: { code: 'PLAN_FETCH_FAILED', message: 'Failed to fetch plan' } });
  }
});

/**
 * GET /api/subscription/current
 *
 * Get the current user's subscription status.
 * Requires authentication.
 */
router.get('/current', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const subscription = await getUserSubscription(req.user.userId);

    if (!subscription) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    // Get plan details if subscribed
    let plan = null;
    if (subscription.subscriptionPlanId) {
      plan = await getPlanById(subscription.subscriptionPlanId);
    }

    res.json({ data: {
      userId: subscription.userId,
      tier: subscription.tier,
      status: subscription.subscriptionStatus,
      plan: plan ? {
        id: plan.id,
        name: plan.name,
        tier: plan.tier,
      } : null,
      subscriptionPlanId: subscription.subscriptionPlanId,
      subscriptionStart: subscription.subscriptionStart,
      subscriptionEnd: subscription.subscriptionEnd,
      trialEnd: subscription.trialEnd,
      hadTrial: subscription.hadTrial,
      cancelledAt: subscription.cancelledAt,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    } });
  } catch (error: any) {
    console.error('[SUBSCRIPTION] Get current subscription error:', error.message);
    res.status(500).json({ error: { code: 'SUBSCRIPTION_FETCH_FAILED', message: 'Failed to fetch subscription status' } });
  }
});

/**
 * GET /api/subscription/trial-eligibility
 *
 * Check if the current user is eligible for a free trial.
 * Requires authentication.
 */
router.get('/trial-eligibility', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const eligible = await checkTrialEligibility(req.user.userId);

    res.json({ data: { eligible } });
  } catch (error: any) {
    console.error('[SUBSCRIPTION] Check trial eligibility error:', error.message);
    res.status(500).json({ error: { code: 'TRIAL_CHECK_FAILED', message: 'Failed to check trial eligibility' } });
  }
});

/**
 * POST /api/subscription/start-trial
 *
 * Start a free trial for the authenticated user.
 * Requires authentication.
 *
 * Request body:
 * - planId: string (e.g., 'semi_monthly', 'pro_monthly', 'pro_yearly')
 */
router.post('/start-trial', requireAuth, async (req: Request, res: Response) => {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'];

  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: { code: 'MISSING_PLAN_ID', message: 'Plan ID is required' } });
    }

    // Verify plan exists and has trial
    const plan = await getPlanById(planId);
    if (!plan) {
      return res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'Plan not found' } });
    }

    if (plan.trial_days <= 0) {
      return res.status(400).json({ error: { code: 'NO_TRIAL', message: 'This plan does not offer a free trial' } });
    }

    // Start trial
    const subscription = await startTrial(req.user.userId, planId, {
      ipAddress,
      userAgent,
    });

    res.json({ data: {
      message: `Your ${plan.trial_days}-day free trial has started!`,
      subscription: {
        tier: subscription.tier,
        status: subscription.subscriptionStatus,
        trialEnd: subscription.trialEnd,
        hadTrial: subscription.hadTrial,
      },
    } });
  } catch (error: any) {
    console.error('[SUBSCRIPTION] Start trial error:', error.message);

    // Return user-friendly error messages
    if (error.message.includes('already used your free trial')) {
      return res.status(409).json({ error: { code: 'TRIAL_USED', message: error.message } });
    }
    if (error.message.includes('Plan not found')) {
      return res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: error.message } });
    }
    if (error.message.includes('does not have a free trial')) {
      return res.status(400).json({ error: { code: 'NO_TRIAL', message: error.message } });
    }

    res.status(500).json({ error: { code: 'TRIAL_START_FAILED', message: 'Failed to start trial' } });
  }
});

/**
 * POST /api/subscription/cancel
 *
 * Cancel the user's subscription at period end.
 * The user keeps access until their subscription/trial expires.
 * Requires authentication.
 *
 * Request body (optional):
 * - reason: string (cancellation reason for analytics)
 */
router.post('/cancel', requireAuth, async (req: Request, res: Response) => {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'];

  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const { reason } = req.body;

    // Get current subscription to validate
    const currentSub = await getUserSubscription(req.user.userId);
    if (!currentSub) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    if (currentSub.subscriptionStatus === 'none' || currentSub.subscriptionStatus === 'expired') {
      return res.status(400).json({ error: { code: 'NO_ACTIVE_SUBSCRIPTION', message: 'No active subscription to cancel' } });
    }

    if (currentSub.cancelAtPeriodEnd) {
      return res.status(400).json({ error: { code: 'ALREADY_CANCELLING', message: 'Subscription is already set to cancel' } });
    }

    // Cancel subscription
    const subscription = await cancelSubscription(req.user.userId, reason, {
      ipAddress,
      userAgent,
    });

    // Determine when access ends
    const accessEndsAt = subscription.trialEnd || subscription.subscriptionEnd;

    res.json({ data: {
      message: 'Your subscription has been cancelled. You will retain access until the end of your current period.',
      subscription: {
        tier: subscription.tier,
        status: subscription.subscriptionStatus,
        accessEndsAt,
        cancelledAt: subscription.cancelledAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
    } });
  } catch (error: any) {
    console.error('[SUBSCRIPTION] Cancel subscription error:', error.message);
    res.status(500).json({ error: { code: 'CANCEL_FAILED', message: 'Failed to cancel subscription' } });
  }
});

/**
 * POST /api/subscription/downgrade
 *
 * Immediately downgrade to basic tier.
 * Loses all premium access instantly.
 * Requires authentication.
 */
router.post('/downgrade', requireAuth, async (req: Request, res: Response) => {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'];

  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    // Get current subscription to validate
    const currentSub = await getUserSubscription(req.user.userId);
    if (!currentSub) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    if (currentSub.tier === 'free' && currentSub.subscriptionStatus === 'none') {
      return res.status(400).json({ error: { code: 'ALREADY_FREE', message: 'Already on free tier' } });
    }

    // Downgrade immediately
    const subscription = await downgradeToBasic(req.user.userId, {
      ipAddress,
      userAgent,
    });

    res.json({ data: {
      message: 'You have been downgraded to the basic tier.',
      subscription: {
        tier: subscription.tier,
        status: subscription.subscriptionStatus,
      },
    } });
  } catch (error: any) {
    console.error('[SUBSCRIPTION] Downgrade error:', error.message);
    res.status(500).json({ error: { code: 'DOWNGRADE_FAILED', message: 'Failed to downgrade subscription' } });
  }
});

/**
 * GET /api/subscription/history
 *
 * Get the user's subscription event history.
 * Requires authentication.
 *
 * Query params:
 * - limit: number (default: 20, max: 100)
 */
router.get('/history', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const history = await getSubscriptionHistory(req.user.userId, limit);

    // Format for frontend
    const formattedHistory = history.map(event => ({
      id: event.id,
      eventType: event.event_type,
      createdAt: event.created_at,
      metadata: event.metadata,
    }));

    res.json({ data: formattedHistory, meta: { count: formattedHistory.length } });
  } catch (error: any) {
    console.error('[SUBSCRIPTION] Get history error:', error.message);
    res.status(500).json({ error: { code: 'HISTORY_FETCH_FAILED', message: 'Failed to fetch subscription history' } });
  }
});

/**
 * POST /api/subscription/admin/expire-check
 *
 * Manually trigger expiration checks for trials and subscriptions.
 * This endpoint is for admin/testing purposes.
 *
 * TODO: Add admin authentication when admin system is implemented.
 * For now, requires a secret key in the request header.
 */
router.post('/admin/expire-check', async (req: Request, res: Response) => {
  try {
    // Simple secret key check for now
    // TODO: Replace with proper admin authentication
    const adminKey = req.headers['x-admin-key'];
    const expectedKey = process.env.ADMIN_SECRET_KEY || 'tiphub-admin-dev-key';

    if (adminKey !== expectedKey) {
      return res.status(403).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    }

    console.log('[SUBSCRIPTION] Admin triggered expiration check');

    const expiredTrials = await expireEndedTrials();
    const expiredSubscriptions = await expireEndedSubscriptions();

    res.json({ data: {
      message: 'Expiration check completed',
      expiredTrials,
      expiredSubscriptions,
      timestamp: new Date().toISOString(),
    } });
  } catch (error: any) {
    console.error('[SUBSCRIPTION] Admin expire check error:', error.message);
    res.status(500).json({ error: { code: 'EXPIRE_CHECK_FAILED', message: 'Failed to run expiration check' } });
  }
});

export default router;
