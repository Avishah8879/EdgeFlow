/**
 * Subscription Data Store
 *
 * Provides functions for managing subscriptions, plans, trials,
 * and subscription lifecycle operations.
 */

import { query, queryOne } from './auth-connection';
import { logAuthEventV2, type DbUser, type SubscriptionStatus } from '../auth/store-v2';

/**
 * Subscription Plan from database
 */
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  tier: 'basic' | 'premium';
  price_cents: number;
  currency: string;
  billing_interval: 'month' | 'year' | 'lifetime' | null;
  interval_count: number;
  trial_days: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * User Subscription Data (subset of DbUser)
 */
export interface UserSubscription {
  userId: string;
  tier: 'basic' | 'premium';
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlanId: string | null;
  subscriptionStart: Date | null;
  subscriptionEnd: Date | null;
  trialEnd: Date | null;
  hadTrial: boolean;
  cancelledAt: Date | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Get all active subscription plans
 */
export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const sql = `
    SELECT * FROM subscription_plans
    WHERE is_active = TRUE
    ORDER BY sort_order ASC
  `;

  const result = await query(sql);
  return result.rows.map(row => ({
    ...row,
    features: Array.isArray(row.features) ? row.features : JSON.parse(row.features || '[]'),
  }));
}

/**
 * Get a subscription plan by ID
 */
export async function getPlanById(planId: string): Promise<SubscriptionPlan | null> {
  const sql = `SELECT * FROM subscription_plans WHERE id = $1`;
  const result = await queryOne<SubscriptionPlan>(sql, [planId]);

  if (!result) return null;

  return {
    ...result,
    features: Array.isArray(result.features) ? result.features : JSON.parse(result.features as any || '[]'),
  };
}

/**
 * Get user's subscription data
 */
export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const sql = `
    SELECT
      id,
      tier,
      subscription_status,
      subscription_plan_id,
      subscription_start,
      subscription_end,
      trial_end,
      had_trial,
      cancelled_at,
      cancel_at_period_end
    FROM users
    WHERE id = $1
  `;

  const row = await queryOne<any>(sql, [userId]);

  if (!row) return null;

  return {
    userId: row.id,
    tier: row.tier,
    subscriptionStatus: row.subscription_status || 'none',
    subscriptionPlanId: row.subscription_plan_id,
    subscriptionStart: row.subscription_start,
    subscriptionEnd: row.subscription_end,
    trialEnd: row.trial_end,
    hadTrial: row.had_trial || false,
    cancelledAt: row.cancelled_at,
    cancelAtPeriodEnd: row.cancel_at_period_end || false,
  };
}

/**
 * Check if user is eligible for a free trial
 */
export async function checkTrialEligibility(userId: string): Promise<boolean> {
  const sql = `SELECT had_trial FROM users WHERE id = $1`;
  const result = await queryOne<{ had_trial: boolean }>(sql, [userId]);

  // User is eligible if they haven't had a trial yet
  return result ? !result.had_trial : false;
}

/**
 * Start a free trial for a user
 */
export async function startTrial(
  userId: string,
  planId: string,
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<UserSubscription> {
  // Get plan to verify trial days
  const plan = await getPlanById(planId);
  if (!plan) {
    throw new Error('Plan not found');
  }

  if (plan.trial_days <= 0) {
    throw new Error('This plan does not have a free trial');
  }

  // Check eligibility
  const eligible = await checkTrialEligibility(userId);
  if (!eligible) {
    throw new Error('You have already used your free trial');
  }

  // Calculate trial end date
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + plan.trial_days);

  // Update user subscription
  const sql = `
    UPDATE users SET
      tier = $1,
      subscription_status = 'trialing',
      subscription_plan_id = $2,
      subscription_start = NOW(),
      trial_end = $3,
      had_trial = TRUE,
      updated_at = NOW()
    WHERE id = $4
    RETURNING *
  `;

  const result = await queryOne<any>(sql, [plan.tier, planId, trialEnd, userId]);

  if (!result) {
    throw new Error('Failed to start trial');
  }

  // Log the event
  await logAuthEventV2({
    userId,
    eventType: 'trial_started',
    provider: 'password',
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
    success: true,
    metadata: { planId, trialDays: plan.trial_days },
  });

  return {
    userId: result.id,
    tier: result.tier,
    subscriptionStatus: result.subscription_status,
    subscriptionPlanId: result.subscription_plan_id,
    subscriptionStart: result.subscription_start,
    subscriptionEnd: result.subscription_end,
    trialEnd: result.trial_end,
    hadTrial: result.had_trial,
    cancelledAt: result.cancelled_at,
    cancelAtPeriodEnd: result.cancel_at_period_end,
  };
}

/**
 * Activate a paid subscription (after payment - future use)
 */
export async function activateSubscription(
  userId: string,
  planId: string,
  subscriptionEnd: Date,
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<UserSubscription> {
  const plan = await getPlanById(planId);
  if (!plan) {
    throw new Error('Plan not found');
  }

  const sql = `
    UPDATE users SET
      tier = $1,
      subscription_status = 'active',
      subscription_plan_id = $2,
      subscription_start = NOW(),
      subscription_end = $3,
      trial_end = NULL,
      cancel_at_period_end = FALSE,
      cancelled_at = NULL,
      updated_at = NOW()
    WHERE id = $4
    RETURNING *
  `;

  const result = await queryOne<any>(sql, [plan.tier, planId, subscriptionEnd, userId]);

  if (!result) {
    throw new Error('Failed to activate subscription');
  }

  await logAuthEventV2({
    userId,
    eventType: 'subscription_upgrade',
    provider: 'password',
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
    success: true,
    metadata: { planId },
  });

  return {
    userId: result.id,
    tier: result.tier,
    subscriptionStatus: result.subscription_status,
    subscriptionPlanId: result.subscription_plan_id,
    subscriptionStart: result.subscription_start,
    subscriptionEnd: result.subscription_end,
    trialEnd: result.trial_end,
    hadTrial: result.had_trial,
    cancelledAt: result.cancelled_at,
    cancelAtPeriodEnd: result.cancel_at_period_end,
  };
}

/**
 * Cancel subscription at period end
 */
export async function cancelSubscription(
  userId: string,
  reason?: string,
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<UserSubscription> {
  const sql = `
    UPDATE users SET
      cancel_at_period_end = TRUE,
      cancelled_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await queryOne<any>(sql, [userId]);

  if (!result) {
    throw new Error('Failed to cancel subscription');
  }

  await logAuthEventV2({
    userId,
    eventType: 'subscription_cancel',
    provider: 'password',
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
    success: true,
    metadata: { reason },
  });

  return {
    userId: result.id,
    tier: result.tier,
    subscriptionStatus: result.subscription_status,
    subscriptionPlanId: result.subscription_plan_id,
    subscriptionStart: result.subscription_start,
    subscriptionEnd: result.subscription_end,
    trialEnd: result.trial_end,
    hadTrial: result.had_trial,
    cancelledAt: result.cancelled_at,
    cancelAtPeriodEnd: result.cancel_at_period_end,
  };
}

/**
 * Immediately downgrade to basic tier
 */
export async function downgradeToBasic(
  userId: string,
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<UserSubscription> {
  const sql = `
    UPDATE users SET
      tier = 'basic',
      subscription_status = 'none',
      subscription_plan_id = 'basic',
      subscription_start = NULL,
      subscription_end = NULL,
      trial_end = NULL,
      cancel_at_period_end = FALSE,
      cancelled_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await queryOne<any>(sql, [userId]);

  if (!result) {
    throw new Error('Failed to downgrade subscription');
  }

  await logAuthEventV2({
    userId,
    eventType: 'subscription_downgrade',
    provider: 'password',
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
    success: true,
    metadata: { reason: 'immediate_downgrade' },
  });

  return {
    userId: result.id,
    tier: result.tier,
    subscriptionStatus: result.subscription_status,
    subscriptionPlanId: result.subscription_plan_id,
    subscriptionStart: result.subscription_start,
    subscriptionEnd: result.subscription_end,
    trialEnd: result.trial_end,
    hadTrial: result.had_trial,
    cancelledAt: result.cancelled_at,
    cancelAtPeriodEnd: result.cancel_at_period_end,
  };
}

/**
 * Get subscription history from auth_logs
 */
export async function getSubscriptionHistory(userId: string, limit: number = 20): Promise<any[]> {
  const sql = `
    SELECT
      id,
      event_type,
      created_at,
      metadata
    FROM auth_logs
    WHERE user_id = $1
      AND event_type IN (
        'subscription_upgrade',
        'subscription_downgrade',
        'subscription_cancel',
        'trial_started',
        'trial_expired',
        'subscription_expired',
        'admin_upgrade'
      )
    ORDER BY created_at DESC
    LIMIT $2
  `;

  const result = await query(sql, [userId, limit]);
  return result.rows;
}

/**
 * Expire ended trials (for cron job)
 * Returns number of expired trials
 */
export async function expireEndedTrials(): Promise<number> {
  const sql = `
    UPDATE users SET
      tier = 'basic',
      subscription_status = 'expired',
      updated_at = NOW()
    WHERE subscription_status = 'trialing'
      AND trial_end IS NOT NULL
      AND trial_end < NOW()
    RETURNING id
  `;

  const result = await query(sql);

  // Log events for each expired trial
  for (const row of result.rows) {
    await logAuthEventV2({
      userId: row.id,
      eventType: 'trial_expired',
      provider: 'password',
      success: true,
      metadata: { reason: 'trial_period_ended' },
    });
  }

  return result.rowCount || 0;
}

/**
 * Expire ended subscriptions (for cron job)
 * Handles subscriptions that are set to cancel at period end
 * Returns number of expired subscriptions
 */
export async function expireEndedSubscriptions(): Promise<number> {
  const sql = `
    UPDATE users SET
      tier = 'basic',
      subscription_status = 'expired',
      updated_at = NOW()
    WHERE subscription_status IN ('active', 'cancelled')
      AND cancel_at_period_end = TRUE
      AND subscription_end IS NOT NULL
      AND subscription_end < NOW()
    RETURNING id
  `;

  const result = await query(sql);

  // Log events for each expired subscription
  for (const row of result.rows) {
    await logAuthEventV2({
      userId: row.id,
      eventType: 'subscription_expired',
      provider: 'password',
      success: true,
      metadata: { reason: 'subscription_period_ended' },
    });
  }

  return result.rowCount || 0;
}

/**
 * Admin upgrade user to premium (direct, no trial)
 */
export async function adminUpgradeUser(
  userId: string,
  planId: string,
  durationMonths: number,
  adminNote?: string
): Promise<UserSubscription> {
  const plan = await getPlanById(planId);
  if (!plan) {
    throw new Error('Plan not found');
  }

  const subscriptionEnd = new Date();
  subscriptionEnd.setMonth(subscriptionEnd.getMonth() + durationMonths);

  const sql = `
    UPDATE users SET
      tier = $1,
      subscription_status = 'active',
      subscription_plan_id = $2,
      subscription_start = NOW(),
      subscription_end = $3,
      trial_end = NULL,
      had_trial = TRUE,
      cancel_at_period_end = FALSE,
      cancelled_at = NULL,
      updated_at = NOW()
    WHERE id = $4
    RETURNING *
  `;

  const result = await queryOne<any>(sql, [plan.tier, planId, subscriptionEnd, userId]);

  if (!result) {
    throw new Error('Failed to upgrade user');
  }

  await logAuthEventV2({
    userId,
    eventType: 'admin_upgrade',
    provider: 'password',
    success: true,
    metadata: { planId, durationMonths, adminNote },
  });

  return {
    userId: result.id,
    tier: result.tier,
    subscriptionStatus: result.subscription_status,
    subscriptionPlanId: result.subscription_plan_id,
    subscriptionStart: result.subscription_start,
    subscriptionEnd: result.subscription_end,
    trialEnd: result.trial_end,
    hadTrial: result.had_trial,
    cancelledAt: result.cancelled_at,
    cancelAtPeriodEnd: result.cancel_at_period_end,
  };
}
