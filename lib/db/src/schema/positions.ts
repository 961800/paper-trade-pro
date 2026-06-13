import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const positionsTable = pgTable("positions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  symbol: text("symbol").notNull(),
  strikePrice: numeric("strike_price", { precision: 15, scale: 2 }).notNull(),
  optionType: text("option_type").notNull(), // CE or PE
  quantity: integer("quantity").notNull(),
  averagePrice: numeric("average_price", { precision: 15, scale: 2 }).notNull(),
  currentPrice: numeric("current_price", { precision: 15, scale: 2 }).notNull(),
  pnl: numeric("pnl", { precision: 15, scale: 2 }).notNull().default("0"),
  unrealizedPnl: numeric("unrealized_pnl", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("open"), // open or closed
  expiry: text("expiry").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const insertPositionSchema = createInsertSchema(positionsTable).omit({ id: true, createdAt: true });
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positionsTable.$inferSelect;
