// Ensure environment variables are loaded before database initialization
import "dotenv/config";

import {
  type WatchlistItem,
  type InsertWatchlistItem,
  type WindowLayout,
  type InsertWindowLayout,
  type ForumMessage,
  type InsertForumMessage,
  watchlistItems,
  windowLayouts,
  forumMessages
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, sql, desc, and } from "drizzle-orm";
import crypto from "crypto";
import { getRedisClient } from "./lib/redis";

// Optional database connection
let db: ReturnType<typeof drizzle> | null = null;
let isDatabaseAvailable = false;
const inMemoryWatchlist: WatchlistItem[] = [];
const inMemoryWindowLayouts: WindowLayout[] = [];
const inMemoryForumMessages: ForumMessage[] = [];

try {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    db = drizzle(pool);
    isDatabaseAvailable = true;
    console.log('[Storage] Database connected successfully');
  } else {
    console.warn('[Storage] DATABASE_URL not provided - running without database');
  }
} catch (error) {
  console.error('[Storage] Database connection failed:', error);
  console.warn('[Storage] Continuing without database - data will not persist');
}

export function isDatabaseConnected(): boolean {
  return isDatabaseAvailable;
}

export interface IStorage {
  // Watchlist operations
  getWatchlistItems(): Promise<WatchlistItem[]>;
  addWatchlistItem(item: InsertWatchlistItem): Promise<WatchlistItem>;
  removeWatchlistItem(symbol: string): Promise<boolean>;
  
  // Window layout operations
  getWindowLayouts(userId?: string): Promise<WindowLayout[]>;
  saveWindowLayout(layout: InsertWindowLayout): Promise<WindowLayout>;
  deleteWindowLayout(windowId: string, userId?: string): Promise<boolean>;
  deleteAllLayoutsForUser(userId: string): Promise<void>;

  // Forum chat operations
  getForumMessages(limit?: number): Promise<ForumMessage[]>;
  addForumMessage(message: InsertForumMessage): Promise<ForumMessage>;
}

// Default watchlist symbols for first-time users
const DEFAULT_WATCHLIST_SYMBOLS = ['RELIANCE', 'ADANIENT', 'TCS', 'INFY', 'HDFCBANK'];

export class DbStorage implements IStorage {
  private async seedDefaultWatchlist(): Promise<WatchlistItem[]> {
    const seededItems: WatchlistItem[] = [];
    for (const symbol of DEFAULT_WATCHLIST_SYMBOLS) {
      const item = await this.addWatchlistItem({ symbol });
      seededItems.push(item);
    }
    return seededItems;
  }

  async getWatchlistItems(): Promise<WatchlistItem[]> {
    if (!db) {
      // In-memory: seed defaults if empty
      if (inMemoryWatchlist.length === 0) {
        await this.seedDefaultWatchlist();
      }
      return [...inMemoryWatchlist];
    }

    const items = await db.select().from(watchlistItems);

    // Seed defaults for first-time users (empty watchlist)
    if (items.length === 0) {
      return await this.seedDefaultWatchlist();
    }

    return items;
  }

  async addWatchlistItem(insertItem: InsertWatchlistItem): Promise<WatchlistItem> {
    if (!db) {
      const existing = inMemoryWatchlist.find(
        (item) => item.symbol.toUpperCase() === insertItem.symbol.toUpperCase()
      );
      if (existing) {
        return existing;
      }
      const newItem: WatchlistItem = {
        id: crypto.randomUUID(),
        symbol: insertItem.symbol.toUpperCase(),
        addedAt: new Date(),
      };
      inMemoryWatchlist.push(newItem);
      return newItem;
    }
    const [item] = await db.insert(watchlistItems)
      .values(insertItem)
      .returning();
    return item;
  }

  async removeWatchlistItem(symbol: string): Promise<boolean> {
    if (!db) {
      const initialLength = inMemoryWatchlist.length;
      const nextItems = inMemoryWatchlist.filter(
        (item) => item.symbol.toUpperCase() !== symbol.toUpperCase()
      );
      inMemoryWatchlist.length = 0;
      inMemoryWatchlist.push(...nextItems);
      return nextItems.length < initialLength;
    }
    const result = await db.delete(watchlistItems)
      .where(eq(watchlistItems.symbol, symbol))
      .returning();
    return result.length > 0;
  }

  async getWindowLayouts(userId?: string): Promise<WindowLayout[]> {
    if (!db) {
      const filtered = inMemoryWindowLayouts.filter((layout) =>
        userId ? layout.userId === userId : !layout.userId
      );
      return [...filtered];
    }

    if (userId) {
      return await db.select().from(windowLayouts)
        .where(eq(windowLayouts.userId, userId));
    }
    return await db.select().from(windowLayouts)
      .where(sql`${windowLayouts.userId} IS NULL`);
  }

  async saveWindowLayout(layout: InsertWindowLayout): Promise<WindowLayout> {
    if (!db) {
      const existingIdx = inMemoryWindowLayouts.findIndex(
        (candidate) =>
          candidate.windowId === layout.windowId &&
          (candidate.userId || null) === (layout.userId || null)
      );
      const now = new Date();
      if (existingIdx >= 0) {
        const updated: WindowLayout = {
          ...inMemoryWindowLayouts[existingIdx],
          ...layout,
          updatedAt: now,
        };
        inMemoryWindowLayouts[existingIdx] = updated;
        return updated;
      }

      const newLayout: WindowLayout = {
        id: crypto.randomUUID(),
        updatedAt: now,
        ...layout,
      } as WindowLayout;
      inMemoryWindowLayouts.push(newLayout);
      return newLayout;
    }

    const existing = await db.select().from(windowLayouts)
      .where(layout.userId
        ? and(eq(windowLayouts.windowId, layout.windowId), eq(windowLayouts.userId, layout.userId))
        : and(eq(windowLayouts.windowId, layout.windowId), sql`${windowLayouts.userId} IS NULL`)
      )
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(windowLayouts)
        .set({
          ...layout,
          updatedAt: new Date(),
        })
        .where(layout.userId
          ? and(eq(windowLayouts.windowId, layout.windowId), eq(windowLayouts.userId, layout.userId))
          : and(eq(windowLayouts.windowId, layout.windowId), sql`${windowLayouts.userId} IS NULL`)
        )
        .returning();
      return updated;
    }

    const [inserted] = await db.insert(windowLayouts)
      .values(layout)
      .returning();
    return inserted;
  }

  async deleteWindowLayout(windowId: string, userId?: string): Promise<boolean> {
    if (!db) {
      const initial = inMemoryWindowLayouts.length;
      const keep = inMemoryWindowLayouts.filter((layout) =>
        userId
          ? !(layout.windowId === windowId && layout.userId === userId)
          : !(layout.windowId === windowId && !layout.userId)
      );
      inMemoryWindowLayouts.length = 0;
      inMemoryWindowLayouts.push(...keep);
      return keep.length < initial;
    }

    const whereClause = userId
      ? and(eq(windowLayouts.windowId, windowId), eq(windowLayouts.userId, userId))
      : and(eq(windowLayouts.windowId, windowId), sql`${windowLayouts.userId} IS NULL`);

    const result = await db.delete(windowLayouts)
      .where(whereClause)
      .returning();
    return result.length > 0;
  }

  async deleteAllLayoutsForUser(userId: string): Promise<void> {
    if (!db) {
      // In-memory: filter out all layouts for this user
      const keep = inMemoryWindowLayouts.filter((layout) => layout.userId !== userId);
      inMemoryWindowLayouts.length = 0;
      inMemoryWindowLayouts.push(...keep);
      return;
    }

    // Database: delete all layouts for user
    await db.delete(windowLayouts).where(eq(windowLayouts.userId, userId));
  }

  async getForumMessages(limit: number = 50): Promise<ForumMessage[]> {
    const cappedLimit = Math.min(Math.max(limit, 1), 200);

    // 1) PostgreSQL (if available)
    if (db) {
      const rows = await db
        .select()
        .from(forumMessages)
        .orderBy(desc(forumMessages.createdAt))
        .limit(cappedLimit);
      return rows.reverse();
    }

    // 2) Redis shared storage (works across PM2 workers)
    try {
      const redis = getRedisClient();
      if (redis) {
        const members = await redis.zrange("forum:messages", -cappedLimit, -1);
        if (members.length > 0 || await redis.exists("forum:messages")) {
          return members.map((m: string) => JSON.parse(m) as ForumMessage);
        }
      }
    } catch {
      // Redis unavailable - fall through to in-memory
    }

    // 3) In-memory fallback (single worker only)
    const sorted = [...inMemoryForumMessages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    return sorted.slice(-cappedLimit);
  }

  async addForumMessage(insertMessage: InsertForumMessage): Promise<ForumMessage> {
    const payload = {
      ...insertMessage,
      userName: insertMessage.userName.trim(),
      message: insertMessage.message.trim(),
    };

    // 1) PostgreSQL (if available)
    if (db) {
      const [created] = await db
        .insert(forumMessages)
        .values(payload)
        .returning();
      return created;
    }

    const message: ForumMessage = {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      ...payload,
    };

    // 2) Redis shared storage (works across PM2 workers)
    try {
      const redis = getRedisClient();
      if (redis) {
        const score = new Date(message.createdAt).getTime();
        await redis.zadd("forum:messages", score, JSON.stringify(message));
        // Cap at 500 messages
        await redis.zremrangebyrank("forum:messages", 0, -501);
        return message;
      }
    } catch {
      // Redis unavailable - fall through to in-memory
    }

    // 3) In-memory fallback (single worker only)
    inMemoryForumMessages.push(message);
    if (inMemoryForumMessages.length > 500) {
      inMemoryForumMessages.splice(0, inMemoryForumMessages.length - 500);
    }
    return message;
  }
}

export const storage = new DbStorage();
