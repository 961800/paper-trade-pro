import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  symbol: text("symbol").notNull(),
  strikePrice: numeric("strike_price", { precision: 15, scale: 2 }).notNull(),
  optionType: text("option_type").notNull(), // CE or PE
  orderType: text("order_type").notNull(), // market or limit
  action: text("action").notNull(), // buy or sell
  quantity: integer("quantity").notNull(),
  executedPrice: numeric("executed_price", { precision: 15, scale: 2 }),
  limitPrice: numeric("limit_price", { precision: 15, scale: 2 }),
  stopLoss: numeric("stop_loss", { precision: 15, scale: 2 }),
  targetPrice: numeric("target_price", { precision: 15, scale: 2 }),
  status: text("status").notNull().default("pending"), // pending, executed, cancelled, rejected
  expiry: text("expiry").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  executedAt: timestamp("executed_at", { withTimezone: true }),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
