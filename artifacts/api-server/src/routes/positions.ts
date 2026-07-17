import { Router, Request } from "express";
import { db } from "@workspace/db";
import { positionsTable, tradesTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getCurrentOptionPrice, getAllIndices } from "../lib/upstox-client";

const router = Router();

interface AuthReq extends Request {
  userId: number;
  user: typeof usersTable.$inferSelect;
}

function serializePosition(pos: typeof positionsTable.$inferSelect) {
  const avgPrice = parseFloat(pos.averagePrice);
  const currentPrice = parseFloat(pos.currentPrice);
  const unrealizedPnl = pos.status === "open" ? (currentPrice - avgPrice) * pos.quantity : 0;
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

/** Settle expired options at intrinsic value */
async function settleExpiredPosition(pos: typeof positionsTable.$inferSelect, userId: number): Promise<typeof positionsTable.$inferSelect> {
  const indices = await getAllIndices();
  const index = indices.find((i) => i.symbol === pos.symbol);
  const spotPrice = index ? index.ltp : parseFloat(pos.strikePrice);

  const strike = parseFloat(pos.strikePrice);
  const isCall = pos.optionType === "CE";
  const intrinsicValue = isCall 
    ? Math.max(0, spotPrice - strike) 
    : Math.max(0, strike - spotPrice);

  const expiredPrice = Math.round(intrinsicValue * 100) / 100;
  const avgPrice = parseFloat(pos.averagePrice);
  const pnl = (expiredPrice - avgPrice) * pos.quantity;

  const [updated] = await db.update(positionsTable).set({
    status: "closed",
    currentPrice: expiredPrice.toString(),
    pnl: pnl.toString(),
    unrealizedPnl: "0",
    closedAt: new Date(),
  }).where(eq(positionsTable.id, pos.id)).returning();

  // Credit cash proceeds back to user balance if option expires in-the-money
  if (expiredPrice > 0) {
    const proceeds = expiredPrice * pos.quantity;
    await db.execute(`UPDATE users SET balance = balance + ${proceeds} WHERE id = ${userId}`);
  }

  // Record the expiry trade
  await db.insert(tradesTable).values({
    userId,
    symbol: pos.symbol,
    strikePrice: pos.strikePrice,
    optionType: pos.optionType,
    action: "sell",
    quantity: pos.quantity,
    entryPrice: pos.averagePrice,
    exitPrice: expiredPrice.toString(),
    pnl: pnl.toString(),
    status: "closed",
    expiry: pos.expiry,
    closedAt: new Date(),
  });

  const pnlText = pnl >= 0 ? `+₹${pnl.toFixed(2)}` : `-₹${Math.abs(pnl).toFixed(2)}`;
  await db.insert(notificationsTable).values({
    userId,
    type: pnl >= 0 ? "profit_target" : "stop_loss",
    title: expiredPrice > 0 ? "Position Settled at Expiry" : "Option Expired Worthless",
    message: expiredPrice > 0
      ? `${pos.symbol} ${pos.strikePrice} ${pos.optionType} settled at expiry at ₹${expiredPrice.toFixed(2)} (Spot: ₹${spotPrice.toLocaleString("en-IN")}) | P&L: ${pnlText}`
      : `${pos.symbol} ${pos.strikePrice} ${pos.optionType} expired worthless on ${pos.expiry} | P&L: ${pnlText}`,
    isRead: false,
  });

  return updated;
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

  const today = new Date().toISOString().split("T")[0];

  // Resolve all open positions in parallel: check expiry + fetch live price
  const resolved = await Promise.all(
    positions.map(async (pos) => {
      if (pos.status !== "open") return pos;

      // Auto-settle if expiry has passed
      if (pos.expiry < today) {
        return settleExpiredPosition(pos, userId);
      }

      // Fetch live price from Upstox (falls back to simulator)
      const livePrice = await getCurrentOptionPrice(
        pos.symbol,
        parseFloat(pos.strikePrice),
        pos.optionType as "CE" | "PE",
        pos.expiry,
      );
      return { ...pos, currentPrice: livePrice.toString() };
    })
  );

  res.json(resolved.map(serializePosition));
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

  const today = new Date().toISOString().split("T")[0];

  // If option already expired, settle at 0
  if (pos.expiry < today) {
    const settled = await settleExpiredPosition(pos, userId);
    res.json(serializePosition(settled));
    return;
  }

  // Fetch live Upstox price for square-off
  const currentPrice = await getCurrentOptionPrice(
    pos.symbol,
    parseFloat(pos.strikePrice),
    pos.optionType as "CE" | "PE",
    pos.expiry,
  );
  const avgPrice = parseFloat(pos.averagePrice);
  const pnl = (currentPrice - avgPrice) * pos.quantity;

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
