import { Router, Request } from "express";
import { db } from "@workspace/db";
import { positionsTable, tradesTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getCurrentOptionPrice } from "../lib/market-simulator";

const router = Router();

interface AuthReq extends Request {
  userId: number;
  user: typeof usersTable.$inferSelect;
}

function serializePosition(pos: typeof positionsTable.$inferSelect) {
  const avgPrice = parseFloat(pos.averagePrice);
  const currentPrice = parseFloat(pos.currentPrice);
  const unrealizedPnl = (currentPrice - avgPrice) * pos.quantity;
  return {
    id: pos.id,
    userId: pos.userId,
    symbol: pos.symbol,
    strikePrice: parseFloat(pos.strikePrice),
    optionType: pos.optionType,
    quantity: pos.quantity,
    averagePrice: avgPrice,
    currentPrice: currentPrice,
    pnl: parseFloat(pos.pnl),
    unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
    status: pos.status,
    expiry: pos.expiry,
    createdAt: pos.createdAt.toISOString(),
    closedAt: pos.closedAt ? pos.closedAt.toISOString() : null,
  };
}

router.use(requireAuth);

router.get("/", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const { status } = req.query as { status?: string };

  const positions = await db.select().from(positionsTable)
    .where(status
      ? and(eq(positionsTable.userId, userId), eq(positionsTable.status, status))
      : eq(positionsTable.userId, userId))
    .orderBy(desc(positionsTable.createdAt));

  // Update current prices for open positions
  const updated = positions.map((pos) => {
    if (pos.status === "open") {
      const currentPrice = getCurrentOptionPrice(pos.symbol, parseFloat(pos.strikePrice), pos.optionType as "CE" | "PE", pos.expiry);
      return { ...pos, currentPrice: currentPrice.toString() };
    }
    return pos;
  });

  res.json(updated.map(serializePosition));
});

router.post("/:id/squareoff", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const id = parseInt(req.params.id as string);

  const [pos] = await db.select().from(positionsTable)
    .where(and(eq(positionsTable.id, id), eq(positionsTable.userId, userId))).limit(1);

  if (!pos) {
    res.status(404).json({ error: "Position not found" });
    return;
  }
  if (pos.status !== "open") {
    res.status(400).json({ error: "Position is already closed" });
    return;
  }

  const currentPrice = getCurrentOptionPrice(pos.symbol, parseFloat(pos.strikePrice), pos.optionType as "CE" | "PE", pos.expiry);
  const avgPrice = parseFloat(pos.averagePrice);
  const pnl = (currentPrice - avgPrice) * pos.quantity;

  // Close position
  const [updatedPos] = await db.update(positionsTable).set({
    status: "closed",
    currentPrice: currentPrice.toString(),
    pnl: pnl.toString(),
    unrealizedPnl: "0",
    closedAt: new Date(),
  }).where(eq(positionsTable.id, id)).returning();

  // Credit proceeds back to user balance
  const proceeds = currentPrice * pos.quantity;
  await db.execute(`UPDATE users SET balance = balance + ${proceeds} WHERE id = ${userId}`);

  // Record trade
  await db.insert(tradesTable).values({
    userId,
    symbol: pos.symbol,
    strikePrice: pos.strikePrice,
    optionType: pos.optionType,
    action: "sell",
    quantity: pos.quantity,
    entryPrice: pos.averagePrice,
    exitPrice: currentPrice.toString(),
    pnl: pnl.toString(),
    status: "closed",
    expiry: pos.expiry,
    closedAt: new Date(),
  });

  // Notification
  const pnlText = pnl >= 0 ? `+₹${pnl.toFixed(2)}` : `-₹${Math.abs(pnl).toFixed(2)}`;
  await db.insert(notificationsTable).values({
    userId,
    type: pnl >= 0 ? "profit_target" : "stop_loss",
    title: "Position Squared Off",
    message: `${pos.symbol} ${pos.strikePrice} ${pos.optionType} closed at ₹${currentPrice.toFixed(2)} | P&L: ${pnlText}`,
    isRead: false,
  });

  res.json(serializePosition(updatedPos));
});

export { router as positionsRouter };
