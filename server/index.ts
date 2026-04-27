// Load environment variables from .env or .env.production based on NODE_ENV
import dotenv from 'dotenv';
import path from 'path';

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile), override: true });

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import type { ListenOptions } from "net";
import type { ViteDevServer } from "vite";
import type { Server } from "http";

const app = express();

// Trust first proxy (ngrok, nginx, load balancer, etc.)
// Required for correct IP detection when behind a reverse proxy
app.set('trust proxy', 1);

// Security headers (X-Content-Type-Options, X-Frame-Options, HSTS, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // Don't block inline scripts/WebSocket for Vite HMR
}));

// Enable CORS with explicit allowed origins
// Parse CORS_ORIGINS from environment, or use defaults
const corsOriginsEnv = process.env.CORS_ORIGINS || '';
const defaultOrigins = [
  'http://localhost:5173',  // Vite dev server
  'http://localhost:5000',  // Production self-origin
  process.env.VITE_GRADIO_BASE_URL,  // Python backend URL
  process.env.VITE_AUTH_BASE_URL,     // Node backend URL (ngrok)
];

const allowedOrigins = corsOriginsEnv
  ? corsOriginsEnv.split(',').map(o => o.trim()).filter(Boolean)
  : defaultOrigins.filter(Boolean);

console.log('[CORS] Allowed origins:', allowedOrigins);
console.log('[CORS] CORS_ORIGINS env:', process.env.CORS_ORIGINS);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      log(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: false  // Changed from true - using token-based auth, not cookies
}));

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '50mb', // Increased for large backtest results (equity curve, candlestick data)
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  // Use path only (no query string) to prevent logging API keys in ?api_key=...
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Import authentication modules AFTER dotenv has loaded
  // (Dynamic import to avoid ES6 hoisting issues)
  const { default: passport } = await import('./auth/oauth-google.js');
  const { default: authV2Routes } = await import('./routes-auth-v2.js');
  const { default: oauthGoogleRoutes } = await import('./routes-oauth-google.js');
  const { default: subscriptionRoutes } = await import('./routes-subscription.js');
  const { default: adminRoutes } = await import('./routes-admin.js');
  const { default: privacyRoutes } = await import('./routes-privacy.js');
  const { default: notificationRoutes } = await import('./routes-notifications.js');
  const { default: publicConfigRoutes } = await import('./routes-public-config.js');
  const { default: savedResultsRoutes } = await import('./routes-saved-results.js');
  const { default: trackingRoutes } = await import('./routes-tracking.js');
  const { default: developerRoutes } = await import('./routes-developer.js');
  const { default: platformsRoutes } = await import('./routes-platforms.js');
  const { default: coinsRoutes }    = await import('./routes-coins.js');
  const { default: paymentsRoutes } = await import('./routes-payments.js');
  const { default: apiKeyAuthRouter } = await import('./middleware/api-key-auth.js');
  const { testAuthDbConnection } = await import('./db/auth-connection.js');
  const { initSubscriptionCronJobs, stopSubscriptionCronJobs } = await import('./cron/subscription-tasks.js');
  const { initUsageFlushCron, stopUsageFlushCron } = await import('./cron/api-usage-flush.js');

  // Initialize Passport for OAuth
  app.use(passport.initialize());

  // Mount new V2 authentication routes
  app.use('/auth', authV2Routes);
  app.use('/auth', oauthGoogleRoutes);

  // Mount subscription routes
  app.use('/api/subscription', subscriptionRoutes);

  // Mount admin routes (requires admin role)
  app.use('/api/admin', adminRoutes);

  // Mount admin platforms routes (sub-resource under /api/admin)
  app.use('/api/admin/platforms', platformsRoutes);

  // Mount coin wallet routes (balance, packs, debit/refund, admin grant)
  app.use('/', coinsRoutes);

  // Mount payment routes (Cashfree checkout + webhook)
  app.use('/', paymentsRoutes);

  // Mount privacy consent routes
  app.use('/api/privacy', privacyRoutes);

  // Mount user-facing notification routes
  app.use('/api/notifications', notificationRoutes);

  // Mount public config routes (page visibility, feature flags)
  app.use('/api/config', publicConfigRoutes);

  // Mount saved results routes (screener/backtest)
  app.use('/api/saved', savedResultsRoutes);

  // Mount tracking routes (page views, clicks, feature usage)
  app.use('/api/track', trackingRoutes);

  // Mount developer API key management routes
  app.use('/api/developer', developerRoutes);

  // Mount internal API key validation endpoint (called by nginx auth_request)
  app.use('/internal/validate-api-key', apiKeyAuthRouter);

  log('[AUTH] V2 authentication routes mounted at /auth/v2/*');
  log('[AUTH] Google OAuth routes mounted at /auth/google');
  log('[SUBSCRIPTION] Subscription routes mounted at /api/subscription/*');
  log('[ADMIN] Admin routes mounted at /api/admin/*');
  log('[PRIVACY] Privacy routes mounted at /api/privacy/*');
  log('[NOTIFICATIONS] Notification routes mounted at /api/notifications/*');
  log('[CONFIG] Public config routes mounted at /api/config/*');
  log('[SAVED] Saved results routes mounted at /api/saved/*');
  log('[TRACKING] Tracking routes mounted at /api/track/*');
  log('[DEVELOPER] Developer API routes mounted at /api/developer/*');
  log('[API_KEY] Internal validation endpoint mounted at /internal/validate-api-key');

  // Test authentication database connection
  log('[AUTH] Testing authentication database connection...');
  const authDbConnected = await testAuthDbConnection();
  if (authDbConnected) {
    log('[AUTH] ✓ Authentication database connected successfully');

    // Initialize subscription cron jobs (only if DB is connected)
    initSubscriptionCronJobs();

    // Initialize API usage flush cron (Redis → PostgreSQL)
    initUsageFlushCron();
  } else {
    log('[AUTH] ⚠️  WARNING: Authentication database connection failed. V2 auth may not work.');
  }

  // Mount EquityPro-specific routes (chart, options, streaming, watchlist, layouts, forum)
  const { registerTerminalRoutes } = await import('./routes-terminal.js');
  registerTerminalRoutes(app);
  log('[TERMINAL] EquityPro routes mounted');

  // ── Coin-gated feature interceptors ─────────────────────────────────────
  // These MUST be registered before registerRoutes() which mounts the
  // Python catch-all at the end. Specific routes always match before catch-all.
  const { coinGate } = await import('./middleware/coin-gate.js');
  const { pythonCatchAllProxy } = await import('./routes.js');
  const { requireAuth: requireAuthMW } = await import('./middleware/auth.js');

  app.post('/api/strategy-backtest/start',        requireAuthMW, coinGate('backtest.run'),      pythonCatchAllProxy);
  app.post('/api/strategy-backtest/hybrid/start', requireAuthMW, coinGate('backtest.run'),      pythonCatchAllProxy);
  app.post('/api/expert-screener/start',          requireAuthMW, coinGate('screener.run'),      pythonCatchAllProxy);
  app.post('/api/sentiment-analysis/start',       requireAuthMW, coinGate('sentiment.analyze'), pythonCatchAllProxy);
  log('[COIN_GATE] Coin-gated interceptors mounted for backtest / screener / sentiment');
  // ────────────────────────────────────────────────────────────────────────

  const server = await registerRoutes(app);

  // Initialize WebSocket server for admin broadcasts
  const { initAdminBroadcast } = await import('./ws-admin-broadcast.js');
  initAdminBroadcast(server);
  log('[WS] Admin broadcast WebSocket initialized at /ws/admin-updates');

  // Proxy WebSocket upgrade requests for /ws/depth/* to Python FastAPI backend
  const { default: httpProxy } = await import('http-proxy');
  const PYTHON_WS_PORT = parseInt(process.env.PYTHON_PORT || '8100', 10);
  const pythonTarget = `http://localhost:${PYTHON_WS_PORT}`;

  const wsProxy = httpProxy.createProxyServer({ target: pythonTarget, ws: true, changeOrigin: true });
  wsProxy.on('error', (err, _req, res) => {
    log(`[WS-PROXY] Error: ${err.message}`);
    if (res && 'writeHead' in res) {
      (res as any).writeHead?.(502);
      (res as any).end?.('WebSocket proxy error');
    }
  });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (!url.startsWith('/ws/depth/')) return;
    wsProxy.ws(req, socket, head);
  });

  log(`[WS-PROXY] Depth WebSocket proxy active → ws://localhost:${PYTHON_WS_PORT}/ws/depth/*`);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  let vite: ViteDevServer | null = null;
  if (app.get("env") === "development") {
    vite = await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const listenOptions: ListenOptions = {
    port,
    host: "0.0.0.0",
  };

  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });

  // Graceful shutdown handler
  let isShuttingDown = false;

  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) {
      log(`[SHUTDOWN] Already shutting down, ignoring ${signal}`);
      return;
    }
    isShuttingDown = true;
    log(`[SHUTDOWN] ${signal} received, starting graceful shutdown...`);

    // Force exit after 10 seconds if graceful shutdown hangs
    const forceExitTimeout = setTimeout(() => {
      log('[SHUTDOWN] Forcing exit after timeout');
      process.exit(1);
    }, 10000);

    try {
      // Stop cron jobs first
      stopSubscriptionCronJobs();
      stopUsageFlushCron();

      // Stop accepting new connections
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            log(`[SHUTDOWN] Error closing HTTP server: ${err.message}`);
            reject(err);
          } else {
            log('[SHUTDOWN] HTTP server closed');
            resolve();
          }
        });
      });

      // Close Vite dev server if running
      if (vite) {
        await vite.close();
        log('[SHUTDOWN] Vite dev server closed');
      }

      // Close Redis connection
      const { closeRedis } = await import('./lib/redis.js');
      await closeRedis();

      // Auth DB pool has its own SIGINT handler, give it time to close
      // (logs: "[AUTH_DB] SIGINT received, closing pool...")
      await new Promise(resolve => setTimeout(resolve, 500));

      clearTimeout(forceExitTimeout);
      log('[SHUTDOWN] Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      log(`[SHUTDOWN] Error during shutdown: ${error}`);
      clearTimeout(forceExitTimeout);
      process.exit(1);
    }
  }

  // Register shutdown handlers
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
})();
