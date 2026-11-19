import { Router, Request } from "express";
import { db } from "@workspace/db";
import { tradesTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

interface AuthReq extends Request {
  userId: number;
  user: typeof usersTable.$inferSelect;
}

function serializeTrade(trade: typeof tradesTable.$inferSelect) {
  return {
    id: trade.id,
    userId: trade.userId,
    symbol: trade.symbol,
    strikePrice: parseFloat(trade.strikePrice),
    optionType: trade.optionType,
    action: trade.action,
    quantity: trade.quantity,
    entryPrice: parseFloat(trade.entryPrice),
    exitPrice: trade.exitPrice ? parseFloat(trade.exitPrice) : null,
    pnl: trade.pnl ? parseFloat(trade.pnl) : null,
    notes: trade.notes ?? null,
    tags: trade.tags ?? null,
    emotion: trade.emotion ?? null,
    strategy: trade.strategy ?? null,
    rating: trade.rating ?? null,
    status: trade.status,
    expiry: trade.expiry,
    createdAt: trade.createdAt.toISOString(),
    closedAt: trade.closedAt ? trade.closedAt.toISOString() : null,
  };
}

router.use(requireAuth);

router.get("/journal-stats", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId));

  const emotionStats: Record<string, { count: number; winCount: number; totalPnl: number }> = {};
  const strategyStats: Record<string, { count: number; winCount: number; totalPnl: number }> = {};

  let totalJournaled = 0;
  let totalClosed = 0;
  let totalClosedPnl = 0;

  for (const t of trades) {
    const pnl = t.pnl ? parseFloat(t.pnl) : 0;
    if (t.status === "closed") {
      totalClosed++;
      totalClosedPnl += pnl;
    }
    if (t.emotion || t.notes || t.strategy) {
      totalJournaled++;
    }

    const emo = t.emotion || "Unspecified";
    if (!emotionStats[emo]) emotionStats[emo] = { count: 0, winCount: 0, totalPnl: 0 };
    emotionStats[emo].count++;
    emotionStats[emo].totalPnl += pnl;
    if (pnl > 0) emotionStats[emo].winCount++;

    const strat = t.strategy || "Discretionary";
    if (!strategyStats[strat]) strategyStats[strat] = { count: 0, winCount: 0, totalPnl: 0 };
    strategyStats[strat].count++;
    strategyStats[strat].totalPnl += pnl;
    if (pnl > 0) strategyStats[strat].winCount++;
  }

  res.json({
    totalTrades: trades.length,
    totalClosed,
    totalJournaled,
    totalClosedPnl: Math.round(totalClosedPnl * 100) / 100,
    emotionStats,
    strategyStats,
  });
});

router.patch("/:id", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const id = parseInt(req.params.id as string);
  const { notes, tags, emotion, strategy, rating } = req.body;

  const [trade] = await db.select().from(tradesTable)
    .where(eq(tradesTable.id, id)).limit(1);

  if (!trade || trade.userId !== userId) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (notes !== undefined) updateData.notes = notes;
  if (tags !== undefined) updateData.tags = tags;
  if (emotion !== undefined) updateData.emotion = emotion;
  if (strategy !== undefined) updateData.strategy = strategy;
  if (rating !== undefined) updateData.rating = rating;

  const [updated] = await db.update(tradesTable).set(updateData)
    .where(eq(tradesTable.id, id)).returning();

  res.json(serializeTrade(updated));
});

router.get("/", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const { limit, offset } = req.query as { limit?: string; offset?: string };

  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId))
    .orderBy(desc(tradesTable.createdAt))
    .limit(limit ? parseInt(limit) : 50)
    .offset(offset ? parseInt(offset) : 0);

  res.json(trades.map(serializeTrade));
});

export { router as tradesRouter };
