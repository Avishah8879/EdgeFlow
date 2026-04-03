/**
 * routes-terminal.ts
 * FinTerminal-specific Express routes:
 * - Market data proxy routes (options, chart, screener, streaming, etc.)
 * - User data CRUD routes (watchlist, window layouts, forum)
 */

import type { Express, Request } from "express";
import { z } from "zod";
import { insertWatchlistItemSchema, insertWindowLayoutSchema } from "@shared/schema";
import { proxyToPython, type ProxyRequestOptions } from "./lib/pythonProxy";
import { sendDataUnavailable, sendSuccess, sendError } from "./lib/apiResponse";
import { storage } from "./storage-ft";

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8100";

const buildPythonOptions = (req: Request, options: ProxyRequestOptions = {}): ProxyRequestOptions => {
  const userLabel = (req as any).userLabel ?? "@anonymous";
  return {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      "x-user-label": userLabel,
    },
  };
};

const forumMessageSchema = z.object({
  message: z.string().trim().min(1).max(1000),
});

export function registerTerminalRoutes(app: Express): void {

  // ── Chart data ─────────────────────────────────────────────────────────

  app.get("/api/chart/intraday/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const valid = ['1m', '5m', '15m', '1h'];
      const raw = typeof req.query.interval === 'string' ? req.query.interval : '5m';
      const interval = valid.includes(raw) ? raw : '5m';
      const result = await proxyToPython(`/api/chart/intraday/${symbol.toUpperCase()}?interval=${interval}`, buildPythonOptions(req, { timeout: 20000 }));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Chart data unavailable');
    }
  });

  app.get("/api/chart/daily/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const params = new URLSearchParams();
      if (req.query.period) params.append('period', String(req.query.period));
      if (req.query.timeframe) params.append('timeframe', String(req.query.timeframe));
      const qs = params.toString();
      const result = await proxyToPython(`/api/chart/daily/${symbol.toUpperCase()}${qs ? `?${qs}` : ''}`, buildPythonOptions(req, { timeout: 20000 }));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Chart data unavailable');
    }
  });

  app.get("/api/charts/batch", async (req, res) => {
    try {
      const params = new URLSearchParams();
      if (req.query.symbols) params.append('symbols', String(req.query.symbols));
      if (req.query.period) params.append('period', String(req.query.period));
      if (req.query.timeframe) params.append('timeframe', String(req.query.timeframe));
      const result = await proxyToPython(`/api/charts/batch?${params.toString()}`, buildPythonOptions(req, { timeout: 30000 }));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Batch chart data unavailable');
    }
  });

  app.get("/api/chart/compare", async (req, res) => {
    try {
      const symbols = typeof req.query.symbols === 'string' ? req.query.symbols : '';
      if (!symbols) return sendError(res, "symbols query param required", undefined, 400);
      const params = new URLSearchParams({ symbols });
      if (typeof req.query.range === 'string') params.set('range', req.query.range);
      const result = await proxyToPython(`/api/chart/compare?${params.toString()}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Comparison data unavailable');
    }
  });

  // ── Options & Derivatives ──────────────────────────────────────────────

  app.get("/api/options/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const expiry = typeof req.query.expiry === 'string' ? `?expiry=${encodeURIComponent(req.query.expiry)}` : '';
      const result = await proxyToPython(`/api/options/${symbol.toUpperCase()}${expiry}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Option chain unavailable');
    }
  });

  app.get("/api/options-visualizer/exposure/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const expiry = typeof req.query.expiry === 'string' ? `?expiry=${encodeURIComponent(req.query.expiry)}` : '';
      const result = await proxyToPython(`/api/options-visualizer/exposure/${symbol.toUpperCase()}${expiry}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Options exposure data unavailable');
    }
  });

  app.get("/api/options-visualizer/timeseries/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const date = typeof req.query.date === 'string' ? `?date=${encodeURIComponent(req.query.date)}` : '';
      const result = await proxyToPython(`/api/options-visualizer/timeseries/${symbol.toUpperCase()}${date}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Options timeseries unavailable');
    }
  });

  app.get("/api/options-visualizer/surface/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const params = new URLSearchParams();
      if (typeof req.query.expiry === 'string') params.append('expiry', req.query.expiry);
      if (typeof req.query.surface_type === 'string') params.append('surface_type', req.query.surface_type);
      if (req.query.include_history === 'true') params.append('include_history', 'true');
      const qs = params.toString();
      const result = await proxyToPython(`/api/options-visualizer/surface/${symbol.toUpperCase()}${qs ? `?${qs}` : ''}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Options surface data unavailable');
    }
  });

  // ── Screener & Optimizer ──────────────────────────────────────────────

  app.post("/api/equity-screener", async (req, res) => {
    try {
      const body = req.body || {};
      const expression = typeof body.expression === "string" ? body.expression.trim() : "";
      if (!expression) return sendError(res, "expression is required", undefined, 400);
      const payload: Record<string, any> = { expression };
      if (Array.isArray(body.symbols)) {
        payload.symbols = body.symbols.map((s: any) => String(s).trim().toUpperCase()).filter(Boolean);
      }
      if (typeof body.period === "string") payload.period = body.period.trim();
      const result = await proxyToPython("/api/equity-screener", buildPythonOptions(req, { method: "POST", data: payload, timeout: 300000 }));
      return res.json(result);
    } catch (error) {
      return sendError(res, "Equity screener unavailable", error instanceof Error ? error.message : undefined);
    }
  });

  app.post("/api/equity-screener/async", async (req, res) => {
    try {
      const body = req.body || {};
      const expression = typeof body.expression === "string" ? body.expression.trim() : "";
      if (!expression) return sendError(res, "expression is required", undefined, 400);
      const payload: Record<string, any> = { expression };
      if (Array.isArray(body.symbols)) {
        payload.symbols = body.symbols.map((s: any) => String(s).trim().toUpperCase()).filter(Boolean);
      }
      if (typeof body.period === "string") payload.period = body.period.trim();
      const result = await proxyToPython("/api/equity-screener/async", buildPythonOptions(req, { method: "POST", data: payload, timeout: 30000 }));
      return res.json(result);
    } catch (error) {
      return sendError(res, "Async screener unavailable", error instanceof Error ? error.message : undefined);
    }
  });

  app.post("/api/portfolio/optimize", async (req, res) => {
    try {
      const body = req.body || {};
      if (!Array.isArray(body.holdings) || body.holdings.length < 2) {
        return sendError(res, "At least 2 holdings required", undefined, 400);
      }
      const payload: Record<string, any> = {
        holdings: body.holdings.map((h: any) => ({
          symbol: String(h.symbol || "").replace(/\.(NS|BO)$/i, "").toUpperCase(),
          quantity: Number(h.quantity) || 0,
        })).filter((h: any) => h.symbol && h.quantity > 0),
      };
      if (typeof body.risk_free_rate === "number") payload.risk_free_rate = body.risk_free_rate;
      if (typeof body.max_weight === "number") payload.max_weight = body.max_weight;
      if (typeof body.rebalance_frequency === "string") payload.rebalance_frequency = body.rebalance_frequency;
      if (typeof body.lookback_period === "string") payload.lookback_period = body.lookback_period;
      const result = await proxyToPython("/api/portfolio/optimize", buildPythonOptions(req, { method: "POST", data: payload, timeout: 30000 }));
      return res.json(result);
    } catch (error) {
      return sendError(res, "Portfolio optimization unavailable", error instanceof Error ? error.message : undefined);
    }
  });

  app.get("/api/jobs/:jobId", async (req, res) => {
    try {
      const result = await proxyToPython(`/api/jobs/${req.params.jobId}`, buildPythonOptions(req, { timeout: 10000 }));
      return res.json(result);
    } catch (error) {
      return sendError(res, "Job status unavailable", error instanceof Error ? error.message : undefined);
    }
  });

  app.delete("/api/jobs/:jobId", async (req, res) => {
    try {
      const result = await proxyToPython(`/api/jobs/${req.params.jobId}`, buildPythonOptions(req, { method: "DELETE", timeout: 10000 }));
      return res.json(result);
    } catch (error) {
      return sendError(res, "Job cancellation failed", error instanceof Error ? error.message : undefined);
    }
  });

  // ── RRG ──────────────────────────────────────────────────────────────

  app.get("/api/rrg-image", async (req, res) => {
    try {
      const symbols = typeof req.query.symbols === 'string' ? req.query.symbols : '';
      if (!symbols) return sendError(res, "symbols query param required", undefined, 400);
      const params = new URLSearchParams({ symbols });
      ['benchmark', 'length', 'trail', 'res', 'labels'].forEach(key => {
        if (typeof req.query[key] === 'string') params.set(key, String(req.query[key]));
      });
      const result = await proxyToPython(`/api/rrg-image?${params.toString()}`, buildPythonOptions(req, { timeout: 30000 }));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'RRG data unavailable');
    }
  });

  // ── SSE Streaming ─────────────────────────────────────────────────────

  const sseProxy = (path: string) => async (req: any, res: any) => {
    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      const axios = await import('axios');
      const url = `${PYTHON_API_URL}${path}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
      const response = await axios.default({ method: 'GET', url, responseType: 'stream', timeout: 0 });
      response.data.pipe(res);
      req.on('close', () => response.data.destroy());
    } catch (error) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Stream unavailable" })}\n\n`);
      res.end();
    }
  };

  app.get("/api/stream/prices", sseProxy("/api/stream/prices"));
  app.get("/api/stream/movers", sseProxy("/api/stream/movers"));
  app.get("/api/stream/indices", sseProxy("/api/stream/indices"));
  app.get("/api/stream/all", sseProxy("/api/stream/all"));

  // ── Market data passthrough routes ─────────────────────────────────────

  app.get("/api/quote/:symbol", async (req, res) => {
    try {
      const result = await proxyToPython(`/api/quote/${req.params.symbol.toUpperCase()}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Quote data unavailable');
    }
  });

  app.get("/api/search-ft", async (req, res) => {
    // /api/search is already claimed by Tiphub — this is an alias for FinTerminal components
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      if (!q) return sendSuccess(res, []);
      const result = await proxyToPython(`/api/search?q=${encodeURIComponent(q)}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Symbol search unavailable');
    }
  });

  const simplePythonProxy = (apiPath: string, timeout = 15000) => async (req: any, res: any) => {
    try {
      const result = await proxyToPython(apiPath, buildPythonOptions(req, { timeout }));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, `${apiPath} unavailable`);
    }
  };

  app.get("/api/sectors/batch", async (req, res) => {
    try {
      const symbols = typeof req.query.symbols === 'string' ? req.query.symbols : '';
      if (!symbols) return sendSuccess(res, []);
      const result = await proxyToPython(`/api/sectors/batch?symbols=${encodeURIComponent(symbols)}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendSuccess(res, []);
    }
  });

  app.get("/api/fear-greed", simplePythonProxy("/api/fear-greed", 20000));
  app.get("/api/research-reports/list", simplePythonProxy("/api/research-reports/list"));
  app.get("/api/research-reports/:symbol", async (req, res) => {
    try {
      const result = await proxyToPython(`/api/research-reports/${req.params.symbol.toUpperCase()}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Research report unavailable');
    }
  });

  app.get("/api/top-stocks", async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await proxyToPython(`/api/top-stocks?limit=${limit}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Top stocks unavailable');
    }
  });

  const unavailable = (msg: string) => (_req: any, res: any) => sendDataUnavailable(res, msg);
  app.get("/api/futures", unavailable('Futures data unavailable - API integration pending'));
  app.get("/api/bonds", unavailable('Bond yields unavailable - API integration pending'));
  app.get("/api/sectors", unavailable('Sector data unavailable - API integration pending'));
  app.get("/api/most-active", unavailable('Most active stocks unavailable - API integration pending'));
  app.get("/api/52week/:symbol", unavailable('52-week data unavailable - API integration pending'));
  app.get("/api/company-logo/:symbol", unavailable('Company logo unavailable - API integration pending'));
  app.get("/api/market-cap", unavailable('Market cap data unavailable - API integration pending'));
  app.get("/api/fii-dii", unavailable('FII/DII data unavailable - API integration pending'));
  app.get("/api/corporate-actions/:symbol", unavailable('Corporate actions unavailable - API integration pending'));
  app.get("/api/corporate-info/:symbol", unavailable('Corporate info unavailable - API integration pending'));
  app.get("/api/financial-results/:symbol", unavailable('Financial results unavailable - API integration pending'));
  app.get("/api/sec-filings", unavailable('SEC filings unavailable - API integration pending'));
  app.get("/api/ipos", unavailable('IPO data unavailable - API integration pending'));

  // ── Watchlist (FinTerminal user data) ──────────────────────────────────

  app.get("/api/ft/watchlist", async (req, res) => {
    try {
      const items = await storage.getWatchlistItems();
      return sendSuccess(res, items);
    } catch (error) {
      return sendError(res, "Failed to fetch watchlist", error instanceof Error ? error.message : undefined);
    }
  });

  app.post("/api/ft/watchlist", async (req, res) => {
    try {
      const parsed = insertWatchlistItemSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, "Invalid request data", parsed.error.message, 400);
      const item = await storage.addWatchlistItem(parsed.data);
      return sendSuccess(res, item, "Symbol added to watchlist", 201);
    } catch (error) {
      return sendError(res, "Failed to add to watchlist", error instanceof Error ? error.message : undefined);
    }
  });

  app.delete("/api/ft/watchlist/:symbol", async (req, res) => {
    try {
      const success = await storage.removeWatchlistItem(req.params.symbol.toUpperCase());
      if (!success) return sendError(res, "Symbol not found in watchlist", undefined, 404);
      return sendSuccess(res, { success: true }, "Symbol removed from watchlist");
    } catch (error) {
      return sendError(res, "Failed to remove from watchlist", error instanceof Error ? error.message : undefined);
    }
  });

  // ── Window Layouts ─────────────────────────────────────────────────────

  app.get("/api/layouts", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const layouts = await storage.getWindowLayouts(userId);
      return sendSuccess(res, layouts);
    } catch (error) {
      return sendError(res, "Failed to fetch layouts", error instanceof Error ? error.message : undefined);
    }
  });

  app.post("/api/layouts", async (req, res) => {
    try {
      const body = {
        ...req.body,
        x: Number(req.body.x),
        y: Number(req.body.y),
        width: Number(req.body.width),
        height: Number(req.body.height),
        zIndex: Number(req.body.zIndex),
      };
      const parsed = insertWindowLayoutSchema.safeParse(body);
      if (!parsed.success) return sendError(res, "Invalid request data", JSON.stringify(parsed.error.format()), 400);
      const layout = await storage.saveWindowLayout(parsed.data);
      return sendSuccess(res, layout, "Layout saved", 201);
    } catch (error) {
      return sendError(res, "Failed to save layout", error instanceof Error ? error.message : undefined);
    }
  });

  app.delete("/api/layouts/all", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      await storage.deleteAllLayoutsForUser(userId ?? "@anonymous");
      return sendSuccess(res, { success: true }, "All layouts deleted");
    } catch (error) {
      return sendError(res, "Failed to delete layouts", error instanceof Error ? error.message : undefined);
    }
  });

  app.delete("/api/layouts/:windowId", async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const success = await storage.deleteWindowLayout(req.params.windowId, userId);
      if (!success) return sendError(res, "Layout not found", undefined, 404);
      return sendSuccess(res, { success: true }, "Layout deleted");
    } catch (error) {
      return sendError(res, "Failed to delete layout", error instanceof Error ? error.message : undefined);
    }
  });

  // ── Forum / Chat ───────────────────────────────────────────────────────

  app.get("/api/forum/messages", async (req, res) => {
    try {
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
      const messages = await storage.getForumMessages(Number.isFinite(limit) ? limit : 50);
      return sendSuccess(res, messages);
    } catch (error) {
      return sendError(res, "Failed to fetch forum messages", error instanceof Error ? error.message : undefined);
    }
  });

  app.post("/api/forum/messages", async (req, res) => {
    try {
      const parsed = forumMessageSchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, "Invalid request data", parsed.error.message, 400);
      const saved = await storage.addForumMessage({
        userId: "anonymous",
        userName: "User",
        message: parsed.data.message,
      });
      return sendSuccess(res, saved, "Message posted", 201);
    } catch (error) {
      return sendError(res, "Failed to post message", error instanceof Error ? error.message : undefined);
    }
  });

  // ── User Stats ─────────────────────────────────────────────────────────

  app.get("/api/user/stats", async (req, res) => {
    try {
      const [watchlistItemsList, messages] = await Promise.all([
        storage.getWatchlistItems(),
        storage.getForumMessages(200),
      ]);
      return sendSuccess(res, {
        watchlistCount: watchlistItemsList.length,
        messagesCount: messages.length,
        topSymbols: watchlistItemsList.slice(0, 5).map(i => i.symbol),
      });
    } catch (error) {
      return sendError(res, "Failed to fetch user stats", error instanceof Error ? error.message : undefined);
    }
  });

  // ── Health ─────────────────────────────────────────────────────────────

  app.get("/api/health", async (req, res) => {
    return res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
}
