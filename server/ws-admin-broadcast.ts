/**
 * WebSocket Server for Admin Broadcasts
 *
 * Provides real-time notifications to users when admin makes changes to their account,
 * such as tier upgrades, feature flag changes, rate limit updates, etc.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { verifyAccessToken } from './auth/jwt';

// ============================================================================
// TYPES
// ============================================================================

export type AdminEventType =
  | 'TIER_CHANGED'
  | 'ROLE_CHANGED'
  | 'FEATURE_FLAG_CHANGED'
  | 'RATE_LIMIT_CHANGED'
  | 'ACCOUNT_UNLOCKED'
  | 'SESSION_REVOKED'
  | 'NOTIFICATION'
  | 'API_KEY_CREATED'
  | 'API_KEY_REVOKED'
  | 'API_KEY_UPDATED';

export interface AdminEvent {
  type: AdminEventType;
  payload: Record<string, unknown>;
  message?: string;
  timestamp: string;
}

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  connectedAt: Date;
}

// ============================================================================
// STATE
// ============================================================================

const clients = new Map<string, Set<ConnectedClient>>();
let wss: WebSocketServer | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the WebSocket server for admin broadcasts.
 * Attaches to an existing HTTP server.
 */
export function initAdminBroadcast(server: Server): WebSocketServer {
  if (wss) {
    console.warn('[WS] Admin broadcast WebSocket server already initialized');
    return wss;
  }

  wss = new WebSocketServer({
    server,
    path: '/ws/admin-updates',
  });

  console.log('[WS] Admin broadcast WebSocket server initialized at /ws/admin-updates');

  wss.on('connection', handleConnection);

  // Heartbeat interval to keep connections alive and clean up dead ones
  const heartbeatInterval = setInterval(() => {
    wss?.clients.forEach((ws) => {
      if ((ws as any).isAlive === false) {
        console.log('[WS] Terminating inactive connection');
        return ws.terminate();
      }
      (ws as any).isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return wss;
}

/**
 * Handle new WebSocket connection.
 */
async function handleConnection(ws: WebSocket, req: IncomingMessage) {
  // Mark as alive for heartbeat
  (ws as any).isAlive = true;
  ws.on('pong', () => {
    (ws as any).isAlive = true;
  });

  // Extract token from query string
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    console.log('[WS] Connection rejected: No token provided');
    ws.close(4001, 'Authentication required');
    return;
  }

  // Verify JWT token
  try {
    const payload = verifyAccessToken(token);
    if (!payload || !payload.userId) {
      console.log('[WS] Connection rejected: Invalid token');
      ws.close(4001, 'Invalid token');
      return;
    }

    const userId = payload.userId;
    const client: ConnectedClient = {
      ws,
      userId,
      connectedAt: new Date(),
    };

    // Add to clients map
    if (!clients.has(userId)) {
      clients.set(userId, new Set());
    }
    clients.get(userId)!.add(client);

    console.log(`[WS] Client connected: ${userId} (${clients.get(userId)?.size} connections)`);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      payload: { userId },
      message: 'Connected to admin updates',
      timestamp: new Date().toISOString(),
    }));

    // Handle disconnect
    ws.on('close', () => {
      const userClients = clients.get(userId);
      if (userClients) {
        userClients.delete(client);
        if (userClients.size === 0) {
          clients.delete(userId);
        }
      }
      console.log(`[WS] Client disconnected: ${userId}`);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[WS] Client error for ${userId}:`, error);
    });

  } catch (error) {
    console.log('[WS] Connection rejected: Token verification failed', error);
    ws.close(4001, 'Token verification failed');
  }
}

// ============================================================================
// BROADCAST FUNCTIONS
// ============================================================================

/**
 * Broadcast an event to a specific user.
 * Sends to all of the user's connected devices/tabs.
 */
export function broadcastToUser(userId: string, event: Omit<AdminEvent, 'timestamp'>): void {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) {
    console.log(`[WS] No connected clients for user ${userId}`);
    return;
  }

  const fullEvent: AdminEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  const message = JSON.stringify(fullEvent);

  let sentCount = 0;
  userClients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
      sentCount++;
    }
  });

  console.log(`[WS] Broadcast to user ${userId}: ${event.type} (${sentCount}/${userClients.size} connections)`);
}

/**
 * Broadcast an event to multiple users.
 */
export function broadcastToUsers(userIds: string[], event: Omit<AdminEvent, 'timestamp'>): void {
  userIds.forEach((userId) => broadcastToUser(userId, event));
}

/**
 * Broadcast an event to all connected clients.
 * Use sparingly - prefer targeted broadcasts.
 */
export function broadcastToAll(event: Omit<AdminEvent, 'timestamp'>): void {
  const fullEvent: AdminEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  const message = JSON.stringify(fullEvent);

  let sentCount = 0;
  clients.forEach((userClients) => {
    userClients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    });
  });

  console.log(`[WS] Broadcast to all: ${event.type} (${sentCount} clients)`);
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Notify user of tier change.
 */
export function notifyTierChange(userId: string, newTier: string, oldTier?: string): void {
  broadcastToUser(userId, {
    type: 'TIER_CHANGED',
    payload: { tier: newTier, previousTier: oldTier },
    message: `Your account has been ${newTier === 'premium' ? 'upgraded to Premium' : 'changed to Basic'}`,
  });
}

/**
 * Notify user of role change.
 */
export function notifyRoleChange(userId: string, newRole: string, oldRole?: string): void {
  broadcastToUser(userId, {
    type: 'ROLE_CHANGED',
    payload: { role: newRole, previousRole: oldRole },
    message: `Your account role has been changed to ${newRole}`,
  });
}

/**
 * Notify all users of a feature flag change.
 */
export function notifyFeatureFlagChange(flagKey: string, isEnabled: boolean): void {
  broadcastToAll({
    type: 'FEATURE_FLAG_CHANGED',
    payload: { flagKey, isEnabled },
  });
}

/**
 * Notify specific user of a feature flag override.
 */
export function notifyFeatureFlagOverride(userId: string, flagKey: string, isEnabled: boolean): void {
  broadcastToUser(userId, {
    type: 'FEATURE_FLAG_CHANGED',
    payload: { flagKey, isEnabled, isOverride: true },
    message: `Feature "${flagKey}" has been ${isEnabled ? 'enabled' : 'disabled'} for your account`,
  });
}

/**
 * Notify all users of rate limit configuration change.
 */
export function notifyRateLimitChange(endpointKey: string): void {
  broadcastToAll({
    type: 'RATE_LIMIT_CHANGED',
    payload: { endpointKey },
  });
}

/**
 * Notify specific user of a rate limit override.
 */
export function notifyRateLimitOverride(userId: string, endpointKey: string): void {
  broadcastToUser(userId, {
    type: 'RATE_LIMIT_CHANGED',
    payload: { endpointKey, isOverride: true },
    message: 'Your rate limits have been updated',
  });
}

/**
 * Notify user that their account has been unlocked.
 */
export function notifyAccountUnlocked(userId: string): void {
  broadcastToUser(userId, {
    type: 'ACCOUNT_UNLOCKED',
    payload: {},
    message: 'Your account has been unlocked',
  });
}

/**
 * Notify user that their sessions have been revoked.
 * Note: They might not receive this if their session was already terminated.
 */
export function notifySessionRevoked(userId: string): void {
  broadcastToUser(userId, {
    type: 'SESSION_REVOKED',
    payload: {},
    message: 'Your sessions have been revoked. Please log in again.',
  });
}

/**
 * Notify user that an API key was created for them (by admin).
 */
export function notifyApiKeyCreated(userId: string, keyName: string): void {
  broadcastToUser(userId, {
    type: 'API_KEY_CREATED',
    payload: { keyName },
    message: `A new API key "${keyName}" has been created for your account.`,
  });
}

/**
 * Notify user that their API key was revoked (by admin).
 */
export function notifyApiKeyRevoked(userId: string, keyName: string): void {
  broadcastToUser(userId, {
    type: 'API_KEY_REVOKED',
    payload: { keyName },
    message: `Your API key "${keyName}" has been revoked by an administrator.`,
  });
}

/**
 * Notify user that their API key was updated (by admin).
 */
export function notifyApiKeyUpdated(userId: string, keyName: string): void {
  broadcastToUser(userId, {
    type: 'API_KEY_UPDATED',
    payload: { keyName },
    message: `Your API key "${keyName}" has been updated by an administrator.`,
  });
}

// ============================================================================
// STATS
// ============================================================================

/**
 * Get statistics about connected clients.
 */
export function getClientStats(): { totalConnections: number; uniqueUsers: number } {
  let totalConnections = 0;
  clients.forEach((userClients) => {
    totalConnections += userClients.size;
  });

  return {
    totalConnections,
    uniqueUsers: clients.size,
  };
}
