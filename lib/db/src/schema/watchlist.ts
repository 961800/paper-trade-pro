import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const watchlistTable = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("index"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWatchlistSchema = createInsertSchema(watchlistTable).omit({ id: true, createdAt: true });
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type WatchlistItem = typeof watchlistTable.$inferSelect;
