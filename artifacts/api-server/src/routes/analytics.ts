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

router.use(requireAuth);

router.get("/monthly", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;

  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId))
    .orderBy(desc(tradesTable.createdAt));

  const closedTrades = trades.filter((t) => t.status === "closed" && t.pnl != null && t.closedAt);

  // Group by month/year
  const monthly: Record<string, { pnl: number; trades: number; wins: number }> = {};
  for (const trade of closedTrades) {
    const date = new Date(trade.closedAt!);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthly[key]) monthly[key] = { pnl: 0, trades: 0, wins: 0 };
    const pnl = parseFloat(trade.pnl ?? "0");
    monthly[key].pnl += pnl;
    monthly[key].trades++;
    if (pnl > 0) monthly[key].wins++;
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const result = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => {
      const [year, month] = key.split("-");
      return {
        month: monthNames[parseInt(month) - 1],
        year: parseInt(year),
        pnl: Math.round(data.pnl * 100) / 100,
        trades: data.trades,
        winRate: data.trades > 0 ? Math.round((data.wins / data.trades) * 10000) / 100 : 0,
      };
    });

  res.json(result);
});

router.get("/summary", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;

  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId))
    .orderBy(desc(tradesTable.createdAt));

  const closedTrades = trades.filter((t) => t.status === "closed" && t.pnl != null);
  const pnls = closedTrades.map((t) => parseFloat(t.pnl ?? "0"));

  const totalPnl = pnls.reduce((sum, p) => sum + p, 0);
  const wins = pnls.filter((p) => p > 0).length;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
  const avgPnl = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;
  const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
  const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;

  // Calculate profit days vs loss days
  const dayPnl: Record<string, number> = {};
  for (const trade of closedTrades) {
    const day = trade.closedAt ? new Date(trade.closedAt).toDateString() : "unknown";
    if (!dayPnl[day]) dayPnl[day] = 0;
    dayPnl[day] += parseFloat(trade.pnl ?? "0");
  }
  const profitDays = Object.values(dayPnl).filter((p) => p > 0).length;
  const lossDays = Object.values(dayPnl).filter((p) => p < 0).length;

  // Current streak
  let currentStreak = 0;
  const sortedByDate = [...closedTrades].sort((a, b) =>
    new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime()
  );
  if (sortedByDate.length > 0) {
    const firstPnl = parseFloat(sortedByDate[0].pnl ?? "0");
    const isWinStreak = firstPnl > 0;
    for (const trade of sortedByDate) {
      const p = parseFloat(trade.pnl ?? "0");
      if ((isWinStreak && p > 0) || (!isWinStreak && p < 0)) {
        currentStreak++;
      } else break;
    }
    if (!isWinStreak) currentStreak = -currentStreak;
  }

  res.json({
    totalTrades: closedTrades.length,
    winRate: Math.round(winRate * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgPnlPerTrade: Math.round(avgPnl * 100) / 100,
    bestTrade: Math.round(bestTrade * 100) / 100,
    worstTrade: Math.round(worstTrade * 100) / 100,
    profitDays,
    lossDays,
    currentStreak,
  });
});

export { router as analyticsRouter };
