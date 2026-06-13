import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone").notNull(),
  age: integer("age").notNull(),
  city: text("city").notNull(),
  balance: numeric("balance", { precision: 15, scale: 2 }).notNull().default("100000"),
  initialCapital: numeric("initial_capital", { precision: 15, scale: 2 }).notNull().default("100000"),
  stopLossLimit: numeric("stop_loss_limit", { precision: 15, scale: 2 }),
  targetPrice: numeric("target_price", { precision: 15, scale: 2 }),
  maxDailyLoss: numeric("max_daily_loss", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
