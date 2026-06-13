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

// Indian market holidays for 2025-2026 (NSE)
const MARKET_HOLIDAYS = new Set([
  "2026-01-26", "2026-03-25", "2026-04-02", "2026-04-14", "2026-04-15",
  "2026-05-01", "2026-08-15", "2026-10-02", "2026-10-20", "2026-10-21",
  "2026-11-05", "2026-12-25",
  "2025-01-26", "2025-02-26", "2025-03-14", "2025-03-31", "2025-04-10",
  "2025-04-14", "2025-04-18", "2025-05-01", "2025-08-15", "2025-10-02",
  "2025-10-02", "2025-10-21", "2025-10-22", "2025-11-05", "2025-12-25",
]);

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

router.use(requireAuth);

router.get("/monthly", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;

  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId))
    .orderBy(desc(tradesTable.createdAt));

  const closedTrades = trades.filter((t) => t.status === "closed" && t.pnl != null && t.closedAt);

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
        pnl: round2(data.pnl),
        trades: data.trades,
        winRate: data.trades > 0 ? round2((data.wins / data.trades) * 100) : 0,
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

  const dayPnl: Record<string, number> = {};
  for (const trade of closedTrades) {
    const day = trade.closedAt ? new Date(trade.closedAt).toDateString() : "unknown";
    if (!dayPnl[day]) dayPnl[day] = 0;
    dayPnl[day] += parseFloat(trade.pnl ?? "0");
  }
  const profitDays = Object.values(dayPnl).filter((p) => p > 0).length;
  const lossDays = Object.values(dayPnl).filter((p) => p < 0).length;

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
    winRate: round2(winRate),
    totalPnl: round2(totalPnl),
    avgPnlPerTrade: round2(avgPnl),
    bestTrade: round2(bestTrade),
    worstTrade: round2(worstTrade),
    profitDays,
    lossDays,
    currentStreak,
  });
});

router.get("/heatmap", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const year = parseInt(String(req.query.year)) || new Date().getFullYear();

  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId));

  const closedTrades = trades.filter((t) => t.status === "closed" && t.pnl != null && t.closedAt);

  // Group by ISO date string
  const byDay: Record<string, { pnl: number; trades: number; wins: number; losses: number; best: number; worst: number }> = {};
  for (const trade of closedTrades) {
    const d = new Date(trade.closedAt!);
    if (d.getFullYear() !== year) continue;
    const key = toDateStr(d);
    if (!byDay[key]) byDay[key] = { pnl: 0, trades: 0, wins: 0, losses: 0, best: 0, worst: 0 };
    const pnl = parseFloat(trade.pnl ?? "0");
    byDay[key].pnl += pnl;
    byDay[key].trades++;
    if (pnl > 0) {
      byDay[key].wins++;
      if (pnl > byDay[key].best) byDay[key].best = pnl;
    } else {
      byDay[key].losses++;
      if (pnl < byDay[key].worst) byDay[key].worst = pnl;
    }
  }

  // Generate all days of the year
  const result = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = toDateStr(new Date(d));
    const dow = new Date(d).getDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = MARKET_HOLIDAYS.has(dateStr);
    const data = byDay[dateStr];

    let status: string;
    if (isWeekend) status = "weekend";
    else if (isHoliday) status = "holiday";
    else if (!data || data.trades === 0) status = "no_trade";
    else if (data.pnl >= 0) status = "profit";
    else status = "loss";

    result.push({
      date: dateStr,
      pnl: data ? round2(data.pnl) : 0,
      trades: data ? data.trades : 0,
      wins: data ? data.wins : 0,
      losses: data ? data.losses : 0,
      winRate: data && data.trades > 0 ? round2((data.wins / data.trades) * 100) : 0,
      bestTrade: data ? round2(data.best) : 0,
      worstTrade: data ? round2(data.worst) : 0,
      status,
    });
  }

  res.json(result);
});

router.get("/stats", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;

  const user = (req as AuthReq).user;
  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId))
    .orderBy(tradesTable.createdAt);

  const closedTrades = trades.filter((t) => t.status === "closed" && t.pnl != null && t.closedAt);
  const pnls = closedTrades.map((t) => parseFloat(t.pnl ?? "0"));

  const totalPnl = pnls.reduce((s, p) => s + p, 0);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const totalProfit = wins.reduce((s, p) => s + p, 0);
  const totalLoss = losses.reduce((s, p) => s + p, 0);

  const profitFactor = totalLoss < 0 ? round2(totalProfit / Math.abs(totalLoss)) : totalProfit > 0 ? 999 : 0;
  const winRate = closedTrades.length > 0 ? round2((wins.length / closedTrades.length) * 100) : 0;
  const avgProfit = wins.length > 0 ? round2(totalProfit / wins.length) : 0;
  const avgLoss = losses.length > 0 ? round2(totalLoss / losses.length) : 0;
  const bestTrade = pnls.length > 0 ? round2(Math.max(...pnls)) : 0;
  const worstTrade = pnls.length > 0 ? round2(Math.min(...pnls)) : 0;

  // Max drawdown
  let peak = 0;
  let cumulative = 0;
  let maxDrawdown = 0;
  for (const pnl of pnls) {
    cumulative += pnl;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Max consecutive wins / losses
  let maxCW = 0, maxCL = 0, curCW = 0, curCL = 0;
  for (const pnl of pnls) {
    if (pnl > 0) {
      curCW++; curCL = 0;
      if (curCW > maxCW) maxCW = curCW;
    } else {
      curCL++; curCW = 0;
      if (curCL > maxCL) maxCL = curCL;
    }
  }

  // ROI
  const initialCapital = parseFloat(user.initialCapital ?? "100000");
  const roi = round2((totalPnl / initialCapital) * 100);

  // Cumulative P&L curve (by trade close date)
  let cum = 0;
  const cumulativePnl = closedTrades.map((t) => {
    cum += parseFloat(t.pnl ?? "0");
    return {
      date: toDateStr(new Date(t.closedAt!)),
      pnl: round2(parseFloat(t.pnl ?? "0")),
      cumulative: round2(cum),
    };
  });

  res.json({
    totalTrades: closedTrades.length,
    winRate,
    totalPnl: round2(totalPnl),
    profitFactor,
    maxDrawdown: round2(maxDrawdown),
    maxConsecutiveWins: maxCW,
    maxConsecutiveLosses: maxCL,
    avgProfit,
    avgLoss,
    bestTrade,
    worstTrade,
    roi,
    totalProfit: round2(totalProfit),
    totalLoss: round2(totalLoss),
    cumulativePnl,
  });
});

export { router as analyticsRouter };
