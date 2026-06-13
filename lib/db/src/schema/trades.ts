import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  symbol: text("symbol").notNull(),
  strikePrice: numeric("strike_price", { precision: 15, scale: 2 }).notNull(),
  optionType: text("option_type").notNull(), // CE or PE
  action: text("action").notNull(), // buy or sell
  quantity: integer("quantity").notNull(),
  entryPrice: numeric("entry_price", { precision: 15, scale: 2 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 15, scale: 2 }),
  pnl: numeric("pnl", { precision: 15, scale: 2 }),
  status: text("status").notNull().default("open"), // open or closed
  expiry: text("expiry").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ id: true, createdAt: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
