/**
 * routes-terminal.ts
 * EquityPro-specific Express routes:
 * - Market data proxy routes (options, chart, screener, streaming, etc.)
 * - User data CRUD routes (watchlist, window layouts, forum)
 */

import type { Express, Request } from "express";
import { z } from "zod";
import { insertWatchlistItemSchema, insertWindowLayoutSchema } from "@shared/schema";
import { proxyToPython, type ProxyRequestOptions } from "./lib/pythonProxy";
import { sendDataUnavailable, sendSuccess, sendError } from "./lib/apiResponse";
import { storage } from "./storage-ft";
import { getFiiDiiRows } from "./fii-dii-upstox";

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

  // Helper: convert Python price-chart response to PriceDataPoint[] format
  function normalizePriceChart(raw: any): Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }> {
    const envelope = raw?.data ?? raw;
    const priceData: any[] = Array.isArray(envelope?.price_data)
      ? envelope.price_data
      : Array.isArray(envelope)
      ? envelope
      : [];
    return priceData
      .filter((p: any) => p != null)
      .map((p: any) => ({
        timestamp: p.timestamp ?? new Date((p.time as number) * 1000).toISOString(),
        open: Number(p.open ?? 0),
        high: Number(p.high ?? 0),
        low: Number(p.low ?? 0),
        close: Number(p.close ?? 0),
        volume: Number(p.volume ?? 0),
      }));
  }

  app.get("/api/chart/intraday/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const sym = symbol.toUpperCase();
      // Map interval to Python timeframe
      const raw = typeof req.query.interval === 'string' ? req.query.interval : '5m';
      const tfMap: Record<string, string> = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1hour' };
      const timeframe = tfMap[raw] ?? '5min';
      const result = await proxyToPython(`/api/price-chart/${encodeURIComponent(sym)}?timeframe=${timeframe}&months=1`, buildPythonOptions(req, { timeout: 20000 }));
      return res.json({ data: normalizePriceChart(result) });
    } catch {
      return sendDataUnavailable(res, 'Chart data unavailable');
    }
  });

  app.get("/api/chart/daily/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const sym = symbol.toUpperCase();
      // Map period to months
      const periodMap: Record<string, number> = { '1y': 12, '2y': 24, '5y': 60 };
      const periodStr = typeof req.query.period === 'string' ? req.query.period : '1y';
      const months = periodMap[periodStr] ?? 12;
      // Map timeframe
      const tfMap: Record<string, string> = { '1D': '1day', '1W': '1week', '1M': '1month' };
      const tfStr = typeof req.query.timeframe === 'string' ? req.query.timeframe : '1D';
      const timeframe = tfMap[tfStr] ?? '1day';
      const result = await proxyToPython(`/api/price-chart/${encodeURIComponent(sym)}?timeframe=${timeframe}&months=${months}`, buildPythonOptions(req, { timeout: 20000 }));
      return res.json({ data: normalizePriceChart(result) });
    } catch {
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

  app.get("/api/compare/metrics", async (req, res) => {
    try {
      const symbols = typeof req.query.symbols === 'string' ? req.query.symbols : '';
      if (!symbols) return sendError(res, "symbols query param required", undefined, 400);
      const params = new URLSearchParams({ symbols });
      if (typeof req.query.benchmark === 'string') params.set('benchmark', req.query.benchmark);
      const result = await proxyToPython(`/api/compare/metrics?${params.toString()}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Comparison metrics unavailable');
    }
  });

  app.get("/api/monitor/sector-heat", async (req, res) => {
    try {
      const params = new URLSearchParams();
      if (typeof req.query.limit === 'string') params.set('limit', req.query.limit);
      if (typeof req.query.universe === 'string') params.set('universe', req.query.universe);
      const qs = params.toString();
      const result = await proxyToPython(`/api/monitor/sector-heat${qs ? `?${qs}` : ''}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Sector heat unavailable');
    }
  });

  app.get("/api/monitor/extremes", async (req, res) => {
    try {
      const params = new URLSearchParams();
      if (typeof req.query.limit === 'string') params.set('limit', req.query.limit);
      if (typeof req.query.proximity_pct === 'string') params.set('proximity_pct', req.query.proximity_pct);
      const qs = params.toString();
      const result = await proxyToPython(`/api/monitor/extremes${qs ? `?${qs}` : ''}`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, '52-week extremes unavailable');
    }
  });

  app.get("/api/world-indices", async (req, res) => {
    try {
      const result = await proxyToPython(`/api/world-indices`, buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'World indices unavailable');
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
    const sym = req.params.symbol.toUpperCase();
    try {
      const result = await proxyToPython(`/api/quote/${sym}`, buildPythonOptions(req));
      // If Python returned a 404-style error, try indices endpoint as fallback
      if (result && (result as any)?.error) throw new Error('not found');
      return res.json(result);
    } catch {
      // Fallback: try to find this symbol in the indices list
      try {
        const indices = await proxyToPython('/api/indices', buildPythonOptions(req));
        const arr = Array.isArray(indices) ? indices : Array.isArray((indices as any)?.data) ? (indices as any).data : [];
        const match = arr.find((idx: any) => {
          const idxSym = (idx.symbol ?? idx.name ?? '').toUpperCase();
          return idxSym === sym || idxSym.includes(sym) || sym.includes(idxSym);
        });
        if (match) {
          return res.json({
            data: {
              symbol: match.symbol ?? sym,
              name: match.name ?? sym,
              ohlc: {
                open: Number(match.open ?? match.ltp ?? 0),
                high: Number(match.high ?? match.ltp ?? 0),
                low: Number(match.low ?? match.ltp ?? 0),
                close: Number(match.close ?? match.ltp ?? 0),
                volume: Number(match.volume ?? 0),
              },
              ltp: Number(match.ltp ?? match.value ?? match.last_price ?? 0),
              change: Number(match.change ?? 0),
              change_percent: Number(match.change_pct ?? match.change_percent ?? 0),
              timestamp: match.updated_at ?? new Date().toISOString(),
            },
          });
        }
      } catch { /* indices fallback failed */ }
      return sendDataUnavailable(res, 'Quote data unavailable');
    }
  });

  app.get("/api/search-ft", async (req, res) => {
    // /api/search is already claimed — this is an alias for EquityPro terminal components
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

  app.get("/api/pair-trading/groups", async (req, res) => {
    try {
      const result = await proxyToPython("/api/pair-trading/groups", buildPythonOptions(req));
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Pair-trading groups unavailable');
    }
  });

  app.get("/api/pair-trading/matrix", async (req, res) => {
    try {
      const params = new URLSearchParams();
      if (typeof req.query.group_type === 'string') params.set('group_type', req.query.group_type);
      if (typeof req.query.group === 'string') params.set('group', req.query.group);
      if (typeof req.query.method === 'string') params.set('method', req.query.method);
      if (typeof req.query.lookback_days === 'string') params.set('lookback_days', req.query.lookback_days);
      const result = await proxyToPython(
        `/api/pair-trading/matrix?${params.toString()}`,
        buildPythonOptions(req, { timeout: 60000 }),
      );
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Pair-trading matrix unavailable');
    }
  });

  app.get("/api/pair-trading/pair-series", async (req, res) => {
    try {
      const params = new URLSearchParams();
      if (typeof req.query.symbols === 'string') params.set('symbols', req.query.symbols);
      if (typeof req.query.lookback_days === 'string') params.set('lookback_days', req.query.lookback_days);
      const result = await proxyToPython(
        `/api/pair-trading/pair-series?${params.toString()}`,
        buildPythonOptions(req),
      );
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Pair series unavailable');
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
  app.get("/api/pattern-search", async (req, res) => {
    try {
      const params = new URLSearchParams();
      if (typeof req.query.pattern === 'string') params.set('pattern', req.query.pattern);
      if (typeof req.query.timeframe === 'string') params.set('timeframe', req.query.timeframe);
      if (typeof req.query.confidence === 'string') params.set('confidence', req.query.confidence);
      const result = await proxyToPython(
        `/api/pattern-search?${params.toString()}`,
        buildPythonOptions(req, { timeout: 60000 })
      );
      // Frontend expects a plain array (no envelope)
      const patterns = Array.isArray(result) ? result : (result as any)?.data ?? [];
      return res.json(patterns);
    } catch (error) {
      return sendDataUnavailable(res, 'Pattern search unavailable');
    }
  });

  app.get("/api/price-pattern-types", async (req, res) => {
    try {
      const result = await proxyToPython(
        `/api/price-pattern-types`,
        buildPythonOptions(req, { timeout: 15000 })
      );
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Price pattern types unavailable');
    }
  });

  app.get("/api/price-pattern-search", async (req, res) => {
    try {
      const params = new URLSearchParams();
      if (typeof req.query.pattern === 'string') params.set('pattern', req.query.pattern);
      if (typeof req.query.timeframe === 'string') params.set('timeframe', req.query.timeframe);
      if (typeof req.query.confidence === 'string') params.set('confidence', req.query.confidence);
      if (typeof req.query.symbol === 'string') params.set('symbol', req.query.symbol);
      const result = await proxyToPython(
        `/api/price-pattern-search?${params.toString()}`,
        buildPythonOptions(req, { timeout: 60000 })
      );
      const patterns = Array.isArray(result) ? result : (result as any)?.data ?? [];
      return res.json(patterns);
    } catch (error) {
      return sendDataUnavailable(res, 'Price pattern search unavailable');
    }
  });

  app.get("/api/seasonality/:ticker", async (req, res) => {
    try {
      const { ticker } = req.params;
      const result = await proxyToPython(
        `/api/seasonality/${encodeURIComponent(ticker.toUpperCase())}`,
        buildPythonOptions(req, { timeout: 30000 })
      );
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Seasonality data unavailable');
    }
  });

  // ── Fundamental Screener (SSE streaming) ────────────────────────────
  app.post("/api/fundamental-screener/start", async (req, res) => {
    try {
      const result = await proxyToPython(
        '/api/fundamental-screener/start',
        buildPythonOptions(req, { method: 'POST', data: req.body, timeout: 30000 })
      );
      return res.json(result);
    } catch (error) {
      return sendError(res, 'Fundamental screener unavailable');
    }
  });

  // Note: /api/fundamental-screener/stream/:jobId is SSE — frontend connects directly to Python backend

  app.post("/api/fundamental-screener/cancel/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const result = await proxyToPython(
        `/api/fundamental-screener/cancel/${jobId}`,
        buildPythonOptions(req, { method: 'POST', timeout: 10000 })
      );
      return res.json(result);
    } catch (error) {
      return sendError(res, 'Failed to cancel fundamental screener');
    }
  });

  app.get("/api/fundamental-screener/variables", async (req, res) => {
    try {
      const result = await proxyToPython(
        '/api/fundamental-screener/variables',
        buildPythonOptions(req)
      );
      return res.json(result);
    } catch (error) {
      return sendDataUnavailable(res, 'Fundamental screener variables unavailable');
    }
  });

  app.get("/api/most-active", async (req, res) => {
    try {
      // Forward sort/limit/proximity_pct query params untouched. The Python
      // endpoint is the source of truth — it joins ltp_live × tickers ×
      // stock_fundamentals and ranks by the sort param (volume / value /
      // gainers / losers / high52w / low52w). Strip-and-remap on the Node
      // side would silently drop fields the new panel needs.
      const params = new URLSearchParams();
      if (typeof req.query.sort === 'string') params.set('sort', req.query.sort);
      if (typeof req.query.limit === 'string') params.set('limit', req.query.limit);
      if (typeof req.query.proximity_pct === 'string') params.set('proximity_pct', req.query.proximity_pct);
      const qs = params.toString();
      const result = await proxyToPython(
        `/api/most-active${qs ? `?${qs}` : ''}`,
        buildPythonOptions(req),
      );
      return res.json(result);
    } catch {
      return sendDataUnavailable(res, 'Most active stocks unavailable');
    }
  });
  app.get("/api/52week/:symbol", unavailable('52-week data unavailable - API integration pending'));
  app.get("/api/company-logo/:symbol", unavailable('Company logo unavailable - API integration pending'));
  app.get("/api/market-cap", unavailable('Market cap data unavailable - API integration pending'));
  app.get("/api/fii-dii", async (_req, res) => {
    try {
      const data = await getFiiDiiRows();
      return res.json(data);
    } catch (error: any) {
      console.error(`[FII_DII] Upstox data unavailable: ${error.message}`);
      return res.status(503).json({
        error: 'FII_DII_UPSTOX_UNAVAILABLE',
        message: 'Unable to load FII/DII data from Upstox right now.',
      });
    }
  });
  app.get("/api/corporate-actions/:symbol", unavailable('Corporate actions unavailable - API integration pending'));
  app.get("/api/corporate-info/:symbol", unavailable('Corporate info unavailable - API integration pending'));
  app.get("/api/financial-results/:symbol", unavailable('Financial results unavailable - API integration pending'));
  app.get("/api/sec-filings", unavailable('SEC filings unavailable - API integration pending'));
  app.get("/api/ipos", unavailable('IPO data unavailable - API integration pending'));

  // ── News (proxy to Python /api/news) ──────────────────────────────────
  app.get("/api/news/top", async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await proxyToPython(`/api/news?limit=${limit}&page=1`, buildPythonOptions(req));
      const envelope = result as any;
      const articles = Array.isArray(envelope?.data) ? envelope.data : Array.isArray(envelope) ? envelope : [];
      return res.json(articles);
    } catch {
      return sendDataUnavailable(res, 'News data unavailable');
    }
  });

  // ── Watchlist (EquityPro user data) ──────────────────────────────────

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

  // ── Fyers Token Management ─────────────────────────────────────────────

  app.get("/api/admin/fyers-token", async (req, res) => {
    try {
      const result = await proxyToPython('/api/admin/fyers-token', buildPythonOptions(req));
      return res.json(result);
    } catch {
      return sendDataUnavailable(res, 'Fyers token status unavailable');
    }
  });

  app.post("/api/admin/fyers-token", async (req, res) => {
    try {
      const result = await proxyToPython('/api/admin/fyers-token', buildPythonOptions(req, { method: 'POST', data: req.body }));
      return res.json(result);
    } catch (error) {
      return sendError(res, 'Failed to update Fyers token');
    }
  });

  // ── Health ─────────────────────────────────────────────────────────────

  app.get("/api/health", async (req, res) => {
    return res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
}
