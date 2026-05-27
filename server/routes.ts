import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import {
  backtestRequestSchema,
} from "../shared/schema.js";
import type {
  BacktestResult,
} from "../shared/schema.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import YahooFinance from "yahoo-finance2";
import axios from "axios";

const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8100";

function buildDevSentimentFallback(path: string, body: any) {
  if (
    process.env.NODE_ENV !== "development" ||
    !path.startsWith("/api/sentiment-analysis/start")
  ) {
    return null;
  }

  const ticker = String(body?.ticker || "DEMO").toUpperCase();
  const today = new Date().toISOString().split("T")[0];
  return {
    success: true,
    data: {
      task_id: null,
      status: "CACHED",
      cached: true,
      result: {
        ticker,
        articles: [
          {
            title: `${ticker} stock gains as investors track earnings outlook`,
            desc: `${ticker} saw renewed investor interest as market participants reviewed recent business momentum and sector trends.`,
            date: today,
            link: `https://news.google.com/search?q=${encodeURIComponent(`${ticker} stock news`)}`,
            source: "Development fallback",
            sentiment: { label: "positive", score: 0.82 },
          },
          {
            title: `${ticker} analysts weigh valuation after recent market moves`,
            desc: `Brokerage commentary on ${ticker} remained balanced, with investors watching execution, margins, and broader market conditions.`,
            date: today,
            link: `https://news.google.com/search?q=${encodeURIComponent(`${ticker} analyst news`)}`,
            source: "Development fallback",
            sentiment: { label: "neutral", score: 0 },
          },
          {
            title: `${ticker} faces pressure from cautious market sentiment`,
            desc: `${ticker} traded with some caution as traders assessed near-term risks and macro conditions.`,
            date: today,
            link: `https://news.google.com/search?q=${encodeURIComponent(`${ticker} market news`)}`,
            source: "Development fallback",
            sentiment: { label: "negative", score: 0.68 },
          },
        ],
        fundamentals: {},
        price_data: [],
        price_error: null,
        cached: true,
      },
    },
  };
}

/**
 * Catch-all proxy: forwards any unmatched /api/* request to the Python backend.
 * This handles all FastAPI endpoints (market-status, search, stocks, indices, etc.)
 * that are not explicitly registered in Express routes above.
 */
export async function pythonCatchAllProxy(req: Request, res: Response): Promise<void> {
  try {
    const targetUrl = `${PYTHON_API_URL}${req.originalUrl}`;
    const response = await axios({
      method: req.method as "get" | "post" | "put" | "delete" | "patch",
      url: targetUrl,
      data: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      headers: {
        "content-type": req.headers["content-type"] || "application/json",
        accept: req.headers["accept"] || "application/json",
      },
      timeout: 30000,
      validateStatus: () => true,
      responseType: "stream",
    });
    res.status(response.status);
    // Forward response headers
    const contentType = response.headers["content-type"];
    if (contentType) res.setHeader("content-type", contentType);
    const cacheControl = response.headers["cache-control"];
    if (cacheControl) res.setHeader("cache-control", cacheControl);
    response.data.pipe(res);
  } catch (err: any) {
    if (!res.headersSent) {
      const fallback = buildDevSentimentFallback(req.originalUrl, req.body);
      if (fallback) {
        res.status(200).json(fallback);
        return;
      }
      res.status(503).json({ success: false, message: "Python backend unavailable", error: err.message });
    }
  }
}

const yahooFinanceClient = new YahooFinance();

const upload = multer({ dest: "uploads/" });


export async function registerRoutes(app: Express): Promise<Server> {
  // V1 auth routes removed - use V2 routes (/auth/v2/*) instead

  app.post("/api/backtest", upload.single("csvFile"), async (req, res) => {
    try {
      const body = req.body;
      const params = backtestRequestSchema.parse({
        custom_rules: body.custom_rules || "",
        minimum_pnl: body.minimum_pnl ? parseFloat(body.minimum_pnl) : 0,
        minimum_calmar: body.minimum_calmar ? parseFloat(body.minimum_calmar) : 0.1,
        subsample_years: body.subsample_years ? parseInt(body.subsample_years) : undefined,
        use_qiga: body.use_qiga === "true" || body.use_qiga === true
      });

      const generateEquityCurve = () => {
        const data = [];
        const baseDate = new Date("2020-01-01");
        let value = 0;
        
        for (let i = 0; i < 500; i++) {
          const date = new Date(baseDate.getTime() + i * 86400000);
          value += (Math.random() - 0.45) * 2;
          data.push({
            date: date.toISOString().split('T')[0],
            value: value
          });
        }
        return data;
      };

      const generateCandlestickData = () => {
        const data = [];
        const baseDate = new Date("2024-06-01");
        let price = 100;
        const entries = [5, 12, 25, 38, 51, 64, 77, 90, 103, 116];
        const exits = [8, 18, 30, 45, 58, 70, 83, 96, 109, 120];
        
        for (let i = 0; i < 120; i++) {
          const date = new Date(baseDate.getTime() + i * 86400000);
          const open = price;
          const high = price + Math.random() * 5;
          const low = price - Math.random() * 5;
          const close = low + Math.random() * (high - low);
          price = close;
          
          data.push({
            date: date.toISOString().split('T')[0],
            open,
            high,
            low,
            close,
            entry: entries.includes(i),
            exit: exits.includes(i)
          });
        }
        return data;
      };

      const result: BacktestResult = {
        condition: "(Close > sma_daily_70) and (Close < sma_daily_20 + 2 * ATR_5) and (Close > ema_daily_30)",
        metrics: {
          num_trades: 47,
          total_profit: 23.45,
          avg_p: 0.0498,
          win_rate: 63.8,
          profit_factor: 2.34,
          Worst_10: -0.0234,
          max_dd: 8.12,
          calmar_ratio: 2.89
        },
        equity_curve: generateEquityCurve(),
        train_end_date: "2021-05-15",
        candlestick_data: generateCandlestickData(),
        duration: 12.45
      };

      if (req.file) {
        fs.unlinkSync(req.file.path);
      }

      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/price-chart", async (req, res) => {
    try {
      const ticker = String(req.query.ticker || "").trim().toUpperCase();
      if (!ticker) {
        return res.status(400).json({ error: "Ticker is required" });
      }

      const period2 = new Date();
      const period1 = new Date(period2);
      period1.setMonth(period1.getMonth() - 6);

      const chartResponse = await yahooFinanceClient.chart(ticker, {
        interval: "1d",
        period1,
        period2,
      });

      const timestamps = (chartResponse as any)?.timestamp;
      const quote = (chartResponse as any)?.indicators?.quote?.[0];
      if (!timestamps || !quote) {
        return res.status(404).json({
          error: "Price data unavailable for requested ticker",
        });
      }

      const series = timestamps
        .map((timestamp: number, index: number) => {
          const open = quote.open?.[index];
          const high = quote.high?.[index];
          const low = quote.low?.[index];
          const close = quote.close?.[index];

          if (
            open == null ||
            high == null ||
            low == null ||
            close == null ||
            Number.isNaN(open) ||
            Number.isNaN(high) ||
            Number.isNaN(low) ||
            Number.isNaN(close)
          ) {
            return null;
          }

          return {
            time: timestamp,
            open,
            high,
            low,
            close,
          };
        })
        .filter((bar: any): bar is NonNullable<typeof bar> => Boolean(bar));

      if (!series.length) {
        return res
          .status(404)
          .json({ error: "No valid price data found for this ticker" });
      }

      res.json({
        ticker,
        interval: "1d",
        range: "6mo",
        data: series,
      });
    } catch (error: any) {
      res.status(500).json({
        error:
          error?.message || "Unexpected error occurred fetching price data",
      });
    }
  });

  // Catch-all: forward unmatched /api/* requests to Python backend (FastAPI)
  // This handles market-status, search, stocks, indices, market-movers, price-chart,
  // technical-indicators, scorecard, sankey, expert-screener, tip-tease, etc.
  app.all("/api/*", pythonCatchAllProxy);

  const httpServer = createServer(app);

  return httpServer;
}
