import { Router, Request } from "express";
import { db } from "@workspace/db";
import { tradesTable, positionsTable, usersTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getCurrentOptionPrice } from "../lib/market-simulator";

const router = Router();

interface AuthReq extends Request {
  userId: number;
  user: typeof usersTable.$inferSelect;
}

router.use(requireAuth);

router.get("/", async (req: Request, res): Promise<void> => {
  const authReq = req as AuthReq;
  const userId = authReq.userId;
  const user = authReq.user;

  // Get all trades
  const allTrades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId))
    .orderBy(desc(tradesTable.createdAt));

  // Get open positions
  const openPositions = await db.select().from(positionsTable)
    .where(and(eq(positionsTable.userId, userId), eq(positionsTable.status, "open")));

  // Update current prices for open positions
  const updatedPositions = openPositions.map((pos) => {
    const currentPrice = getCurrentOptionPrice(pos.symbol, parseFloat(pos.strikePrice), pos.optionType as "CE" | "PE", pos.expiry);
    const unrealizedPnl = (currentPrice - parseFloat(pos.averagePrice)) * pos.quantity;
    return {
      id: pos.id,
      userId: pos.userId,
      symbol: pos.symbol,
      strikePrice: parseFloat(pos.strikePrice),
      optionType: pos.optionType,
      quantity: pos.quantity,
      averagePrice: parseFloat(pos.averagePrice),
      currentPrice,
      pnl: parseFloat(pos.pnl),
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
      status: pos.status,
      expiry: pos.expiry,
      createdAt: pos.createdAt.toISOString(),
      closedAt: pos.closedAt ? pos.closedAt.toISOString() : null,
    };
  });

  const closedTrades = allTrades.filter((t) => t.status === "closed" && t.pnl != null);
  const totalPnl = closedTrades.reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0);

  // Today's P&L
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTrades = closedTrades.filter((t) => t.closedAt && t.closedAt >= today);
  const todayPnl = todayTrades.reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0);

  // Win rate
  const profitableTrades = closedTrades.filter((t) => parseFloat(t.pnl ?? "0") > 0).length;
  const winRate = closedTrades.length > 0 ? (profitableTrades / closedTrades.length) * 100 : 0;

  // Portfolio value = balance + unrealized P&L from open positions
  const unrealizedTotal = updatedPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const portfolioValue = parseFloat(user.balance) + unrealizedTotal;

  // Recent trades (serialized)
  const recentTrades = allTrades.slice(0, 5).map((t) => ({
    id: t.id,
    userId: t.userId,
    symbol: t.symbol,
    strikePrice: parseFloat(t.strikePrice),
    optionType: t.optionType,
    action: t.action,
    quantity: t.quantity,
    entryPrice: parseFloat(t.entryPrice),
    exitPrice: t.exitPrice ? parseFloat(t.exitPrice) : null,
    pnl: t.pnl ? parseFloat(t.pnl) : null,
    status: t.status,
    expiry: t.expiry,
    createdAt: t.createdAt.toISOString(),
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
  }));

  res.json({
    balance: parseFloat(user.balance),
    totalPnl: Math.round(totalPnl * 100) / 100,
    todayPnl: Math.round(todayPnl * 100) / 100,
    openPositionsCount: openPositions.length,
    portfolioValue: Math.round(portfolioValue * 100) / 100,
    winRate: Math.round(winRate * 100) / 100,
    totalTrades: closedTrades.length,
    profitableTrades,
    recentTrades,
    openPositions: updatedPositions,
  });
});

export { router as dashboardRouter };
