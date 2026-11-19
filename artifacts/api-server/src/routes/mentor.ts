import { Router } from "express";
import { z } from "zod";
import { db, mentorMessagesTable, systemSettingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  analyzeUserTrading,
  generateMentorResponse,
  getGeminiApiKey,
} from "../lib/trading-mentor";

const router = Router();

// Apply auth to all mentor routes
router.use(requireAuth);

/**
 * GET /api/mentor/analysis
 * Returns quantitative metrics, behavioral diagnostics, and discipline score
 */
router.get("/analysis", async (req, res): Promise<void> => {
  try {
    const range = (req.query.range as "today" | "7d" | "30d" | "all") || "all";
    const report = await analyzeUserTrading(req.userId!, range);
    res.json(report);
  } catch (err: any) {
    console.error("Mentor analysis failed:", err);
    res.status(500).json({ error: "Failed to generate trading analysis" });
  }
});

/**
 * POST /api/mentor/chat
 * Primary conversation endpoint
 */
router.post("/chat", async (req, res): Promise<void> => {
  try {
    const schema = z.object({
      message: z.string().min(1, "Message is required"),
      range: z.enum(["today", "7d", "30d", "all"]).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
      return;
    }

    const { message, range = "all" } = parsed.data;
    const userId = req.userId!;

    // 1. Calculate up-to-the-second real trading analytics
    const analysis = await analyzeUserTrading(userId, range);

    // 2. Fetch past conversation history
    const pastRows = await db
      .select()
      .from(mentorMessagesTable)
      .where(eq(mentorMessagesTable.userId, userId))
      .orderBy(desc(mentorMessagesTable.createdAt))
      .limit(6);

    const history = pastRows.reverse().map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));

    // 3. Save user message to database
    await db.insert(mentorMessagesTable).values({
      userId,
      role: "user",
      content: message,
    });

    // 4. Generate grounded AI response
    const { reply, suggestedFollowUps } = await generateMentorResponse(message, analysis, history);

    // 5. Save assistant response to database
    await db.insert(mentorMessagesTable).values({
      userId,
      role: "assistant",
      content: reply,
      metadata: JSON.stringify({ suggestedFollowUps, score: analysis.discipline.totalScore }),
    });

    res.json({
      reply,
      suggestedFollowUps,
      disciplineScore: analysis.discipline.totalScore,
      rating: analysis.discipline.rating,
      metrics: analysis.metrics,
      topMistakes: analysis.topMistakes,
    });
  } catch (err: any) {
    console.error("Mentor chat error:", err);
    res.status(500).json({ error: "Failed to process mentor request" });
  }
});

/**
 * GET /api/mentor/history
 * Returns chat message history
 */
router.get("/history", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(mentorMessagesTable)
      .where(eq(mentorMessagesTable.userId, req.userId!))
      .orderBy(desc(mentorMessagesTable.createdAt))
      .limit(50);

    const formatted = rows.reverse().map((r) => {
      let meta: any = null;
      try {
        if (r.metadata) meta = JSON.parse(r.metadata);
      } catch {}
      return {
        id: r.id,
        role: r.role,
        content: r.content,
        createdAt: r.createdAt,
        suggestedFollowUps: meta?.suggestedFollowUps || [],
      };
    });

    res.json({ messages: formatted });
  } catch (err: any) {
    console.error("Failed to load mentor history:", err);
    res.status(500).json({ error: "Failed to load chat history" });
  }
});

/**
 * DELETE /api/mentor/history
 * Clear conversation history
 */
router.delete("/history", async (req, res): Promise<void> => {
  try {
    await db.delete(mentorMessagesTable).where(eq(mentorMessagesTable.userId, req.userId!));
    res.json({ success: true, message: "Conversation history cleared" });
  } catch (err: any) {
    console.error("Failed to clear mentor history:", err);
    res.status(500).json({ error: "Failed to clear history" });
  }
});

/**
 * GET /api/mentor/gemini-status
 */
router.get("/gemini-status", async (_req, res): Promise<void> => {
  try {
    const key = await getGeminiApiKey();
    res.json({
      configured: Boolean(key && key.length > 5),
      source: process.env.GEMINI_API_KEY ? "env" : key ? "database" : "none",
    });
  } catch (err) {
    res.json({ configured: false, source: "none" });
  }
});

/**
 * POST /api/mentor/gemini-key
 */
router.post("/gemini-key", async (req, res): Promise<void> => {
  try {
    const { key } = req.body;
    if (typeof key !== "string" || key.trim().length === 0) {
      res.status(400).json({ error: "API key cannot be empty" });
      return;
    }

    const cleanKey = key.trim();
    const [existing] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "gemini_api_key"))
      .limit(1);

    if (existing) {
      await db
        .update(systemSettingsTable)
        .set({ value: cleanKey, updatedAt: new Date() })
        .where(eq(systemSettingsTable.key, "gemini_api_key"));
    } else {
      await db.insert(systemSettingsTable).values({
        key: "gemini_api_key",
        value: cleanKey,
        description: "Google Gemini API key for AI Personal Trading Mentor",
      });
    }

    res.json({ success: true, message: "Gemini API key saved successfully" });
  } catch (err: any) {
    console.error("Failed to save gemini key:", err);
    res.status(500).json({ error: "Failed to update Gemini API key" });
  }
});

export default router;
