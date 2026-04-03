import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── FinTerminal tables ────────────────────────────────────────────────────

export const watchlistItems = pgTable("watchlist_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});
export const insertWatchlistItemSchema = createInsertSchema(watchlistItems).pick({ symbol: true });
export type InsertWatchlistItem = z.infer<typeof insertWatchlistItemSchema>;
export type WatchlistItem = typeof watchlistItems.$inferSelect;

export const windowLayouts = pgTable("window_layouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  windowType: text("window_type").notNull(),
  windowId: text("window_id").notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  zIndex: integer("z_index").notNull(),
  isMinimized: boolean("is_minimized").notNull().default(false),
  symbol: text("symbol"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const insertWindowLayoutSchema = createInsertSchema(windowLayouts).omit({ id: true, updatedAt: true });
export type InsertWindowLayout = z.infer<typeof insertWindowLayoutSchema>;
export type WindowLayout = typeof windowLayouts.$inferSelect;

export const forumMessages = pgTable("forum_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  userName: text("user_name").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const insertForumMessageSchema = createInsertSchema(forumMessages).omit({ id: true, createdAt: true });
export type InsertForumMessage = z.infer<typeof insertForumMessageSchema>;
export type ForumMessage = typeof forumMessages.$inferSelect;

// FinTerminal TypeScript interfaces
export interface StockQuote {
  symbol: string; price: number; change: number; changePercent: number;
  high: number; low: number; open: number; previousClose: number; volume: number; timestamp: string;
}
export interface PriceDataPoint {
  timestamp: string; open: number; high: number; low: number; close: number; volume: number;
}
export interface ChartData { symbol: string; timeframe: string; data: PriceDataPoint[]; }
export interface SymbolSearchResult {
  symbol: string; name: string; type: string; region: string; currency: string; isIndex?: boolean; sector?: string;
}
export interface NewsArticle {
  id: string; headline: string; source: string; timestamp: string; url?: string; summary?: string; tickers?: string[];
}
export interface MarketStatus { market: string; status: 'OPEN' | 'CLOSED' | 'PRE' | 'POST'; nextOpen?: string; nextClose?: string; }
export interface WindowConfig {
  id: string; type: string; title: string;
  x: number; y: number; width: number; height: number; zIndex: number; minimized: boolean; symbol?: string;
}

// ─────────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export interface Stock {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: string;
  volume: number;
  logo?: string;
}

export interface Index {
  id: string;
  name: string;
  symbol: string;
  value: number;
  change: number;
  changePercent: number;
}

export interface MutualFund {
  id: string;
  name: string;
  symbol: string;
  category: string;
  returns1Y: number;
  returns3Y?: number;
  returns5Y?: number;
  fundHouse: string;
  logo?: string;
  navValue: number;
}

export interface Deal {
  id: string;
  investor: string;
  company: string;
  type: 'buy' | 'sell';
  shares: number;
  date: string;
  amount: number;
}

export interface SentimentArticle {
  title: string;
  desc: string;
  date: string;
  link: string;
  source: "GoogleNews";
  sentiment: {
    label: "positive" | "negative" | "neutral";
    score: number;
  };
}

export interface Fundamentals {
  "Market Cap": string;
  "P/E": string;
  "Beta": string;
  "Price": string;
}

export interface SentimentAnalysisResult {
  articles: SentimentArticle[];
  fundamentals: Fundamentals;
  priceData?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  priceError?: string | null;
}

export const sentimentAnalysisRequestSchema = z.object({
  ticker: z.string().min(1).max(20),
});

export type SentimentAnalysisRequest = z.infer<typeof sentimentAnalysisRequestSchema>;

export interface BacktestMetrics {
  num_trades: number;
  total_profit: number | null;
  avg_p: number | null;
  win_rate: number | null;
  profit_factor: number | null;
  Worst_10: number | null;
  max_dd: number | null;
  calmar_ratio: number | null;
}

export interface BacktestCandlestickBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  entry?: boolean;
  exit?: boolean;
  entry_price?: number | null;
  exit_price?: number | null;
}

export interface BacktestResult {
  condition: string;
  metrics: BacktestMetrics;
  equity_curve: Array<{ date: string; value: number }>;
  equity_curve_image?: string;
  train_end_date?: string;
  train_end_index?: number;
  candlestick_data?: BacktestCandlestickBar[];
  max_drawdown_point?: { date: string; value: number | null };
  fitness_progress?: number[];
  duration: number;
  // Additional fields for TPSL optimization
  target_pct?: number;
  stop_pct?: number;
}

export const backtestRequestSchema = z.object({
  custom_rules: z.string().optional(),
  minimum_pnl: z.number().optional().default(0),
  minimum_calmar: z.number().optional().default(0.1),
  subsample_years: z.number().optional(),
  use_qiga: z.boolean().optional().default(true),
});

export type BacktestRequest = z.infer<typeof backtestRequestSchema>;
