import { pgTable, text, serial, integer, numeric, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  replitId: text("replit_id").unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  phone: text("phone"),
  age: integer("age"),
  city: text("city"),
  balance: numeric("balance", { precision: 15, scale: 2 }).notNull().default("100000"),
  initialCapital: numeric("initial_capital", { precision: 15, scale: 2 }).notNull().default("100000"),
  stopLossLimit: numeric("stop_loss_limit", { precision: 15, scale: 2 }),
  targetPrice: numeric("target_price", { precision: 15, scale: 2 }),
  maxDailyLoss: numeric("max_daily_loss", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("users_phone_unique").on(table.phone),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
