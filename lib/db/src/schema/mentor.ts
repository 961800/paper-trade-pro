import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const mentorMessagesTable = pgTable("mentor_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  metadata: text("metadata"), // JSON stringified for followUps, score, mistakes
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MentorMessage = typeof mentorMessagesTable.$inferSelect;
