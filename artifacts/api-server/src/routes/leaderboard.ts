import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, tradesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res): Promise<void> => {
  const { period } = req.query as { period?: string };

  // Get all users
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));

  const entries = await Promise.all(users.map(async (user, idx) => {
    const trades = await db.select().from(tradesTable)
      .where(eq(tradesTable.userId, user.id));

    const closedTrades = trades.filter((t) => t.status === "closed" && t.pnl != null);
    const totalPnl = closedTrades.reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0);
    const winTrades = closedTrades.filter((t) => parseFloat(t.pnl ?? "0") > 0);
    const winRate = closedTrades.length > 0 ? (winTrades.length / closedTrades.length) * 100 : 0;
    const initialCapital = parseFloat(user.initialCapital);
    const percentageGain = initialCapital > 0 ? (totalPnl / initialCapital) * 100 : 0;

    return {
      rank: idx + 1,
      userId: user.id,
      fullName: user.fullName,
      city: user.city,
      totalPnl: Math.round(totalPnl * 100) / 100,
      percentageGain: Math.round(percentageGain * 100) / 100,
      totalTrades: closedTrades.length,
      winRate: Math.round(winRate * 100) / 100,
    };
  }));

  // Sort by total P&L descending
  entries.sort((a, b) => b.totalPnl - a.totalPnl);
  entries.forEach((e, i) => (e.rank = i + 1));

  res.json(entries.slice(0, 50));
});

export { router as leaderboardRouter };
