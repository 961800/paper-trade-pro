import { Router, Request } from "express";
import { db } from "@workspace/db";
import { ordersTable, positionsTable, tradesTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getCurrentOptionPrice } from "../lib/market-simulator";
import { z } from "zod";

const router = Router();

interface AuthReq extends Request {
  userId: number;
  user: typeof usersTable.$inferSelect;
}

function serializeOrder(order: typeof ordersTable.$inferSelect) {
  return {
    id: order.id,
    userId: order.userId,
    symbol: order.symbol,
    strikePrice: parseFloat(order.strikePrice),
    optionType: order.optionType,
    orderType: order.orderType,
    action: order.action,
    quantity: order.quantity,
    executedPrice: order.executedPrice ? parseFloat(order.executedPrice) : null,
    limitPrice: order.limitPrice ? parseFloat(order.limitPrice) : null,
    stopLoss: order.stopLoss ? parseFloat(order.stopLoss) : null,
    targetPrice: order.targetPrice ? parseFloat(order.targetPrice) : null,
    status: order.status,
    expiry: order.expiry,
    createdAt: order.createdAt.toISOString(),
    executedAt: order.executedAt ? order.executedAt.toISOString() : null,
  };
}

const orderSchema = z.object({
  symbol: z.string(),
  strikePrice: z.number(),
  optionType: z.enum(["CE", "PE"]),
  orderType: z.enum(["market", "limit"]),
  action: z.enum(["buy", "sell"]),
  quantity: z.number().int().min(1),
  expiry: z.string(),
  limitPrice: z.number().optional().nullable(),
  stopLoss: z.number().optional().nullable(),
  targetPrice: z.number().optional().nullable(),
});

router.use(requireAuth);

router.get("/", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const { status, limit } = req.query as { status?: string; limit?: string };
  let query = db.select().from(ordersTable).where(eq(ordersTable.userId, userId)).$dynamic();
  if (status) {
    query = db.select().from(ordersTable).where(and(eq(ordersTable.userId, userId), eq(ordersTable.status, status))).$dynamic();
  }
  const orders = await db.select().from(ordersTable)
    .where(status ? and(eq(ordersTable.userId, userId), eq(ordersTable.status, status)) : eq(ordersTable.userId, userId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit ? parseInt(limit) : 100);
  res.json(orders.map(serializeOrder));
});

router.post("/", async (req: Request, res): Promise<void> => {
  const authReq = req as AuthReq;
  const userId = authReq.userId;
  const user = authReq.user;

  const parse = orderSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid order data" });
    return;
  }
  const { symbol, strikePrice, optionType, orderType, action, quantity, expiry, limitPrice, stopLoss, targetPrice } = parse.data;

  // Get current option price
  const currentPrice = getCurrentOptionPrice(symbol, strikePrice, optionType as "CE" | "PE", expiry);

  // Calculate cost for buy orders
  if (action === "buy") {
    const executionPrice = orderType === "market" ? currentPrice : (limitPrice ?? currentPrice);
    // Check for lot sizes here - we'll use quantity as number of lots
    const totalCost = executionPrice * quantity;
    const currentBalance = parseFloat(user.balance);

    if (totalCost > currentBalance) {
      res.status(400).json({ error: `Insufficient balance. Required: ₹${totalCost.toFixed(2)}, Available: ₹${currentBalance.toFixed(2)}` });
      return;
    }
  }

  const executionPrice = orderType === "market" ? currentPrice : null;
  const status = orderType === "market" ? "executed" : "pending";

  const [order] = await db.insert(ordersTable).values({
    userId,
    symbol,
    strikePrice: strikePrice.toString(),
    optionType,
    orderType,
    action,
    quantity,
    executedPrice: executionPrice?.toString() ?? null,
    limitPrice: limitPrice?.toString() ?? null,
    stopLoss: stopLoss?.toString() ?? null,
    targetPrice: targetPrice?.toString() ?? null,
    status,
    expiry,
    executedAt: orderType === "market" ? new Date() : null,
  }).returning();

  // If market order, update position and balance
  if (orderType === "market" && executionPrice) {
    await executeOrder(userId, order.id, symbol, strikePrice, optionType, action, quantity, executionPrice, expiry);
  }

  // Create notification
  await db.insert(notificationsTable).values({
    userId,
    type: "order_executed",
    title: orderType === "market" ? "Order Executed" : "Order Placed",
    message: `${action.toUpperCase()} ${quantity} ${symbol} ${strikePrice} ${optionType} @ ₹${executionPrice?.toFixed(2) ?? (limitPrice ?? currentPrice).toFixed(2)}`,
    isRead: false,
  });

  res.status(201).json(serializeOrder(order));
});

async function executeOrder(
  userId: number,
  orderId: number,
  symbol: string,
  strikePrice: number,
  optionType: string,
  action: string,
  quantity: number,
  executionPrice: number,
  expiry: string
) {
  const totalCost = executionPrice * quantity;

  if (action === "buy") {
    // Deduct from balance
    await db.execute(`UPDATE users SET balance = balance - ${totalCost} WHERE id = ${userId}`);

    // Create/update position
    const existing = await db.select().from(positionsTable)
      .where(and(
        eq(positionsTable.userId, userId),
        eq(positionsTable.symbol, symbol),
        eq(positionsTable.strikePrice, strikePrice.toString()),
        eq(positionsTable.optionType, optionType),
        eq(positionsTable.expiry, expiry),
        eq(positionsTable.status, "open")
      )).limit(1);

    if (existing.length > 0) {
      const pos = existing[0];
      const newQty = pos.quantity + quantity;
      const newAvg = ((parseFloat(pos.averagePrice) * pos.quantity) + (executionPrice * quantity)) / newQty;
      await db.update(positionsTable).set({
        quantity: newQty,
        averagePrice: newAvg.toString(),
        currentPrice: executionPrice.toString(),
      }).where(eq(positionsTable.id, pos.id));
    } else {
      await db.insert(positionsTable).values({
        userId,
        symbol,
        strikePrice: strikePrice.toString(),
        optionType,
        quantity,
        averagePrice: executionPrice.toString(),
        currentPrice: executionPrice.toString(),
        pnl: "0",
        unrealizedPnl: "0",
        status: "open",
        expiry,
      });
    }

    // Record trade
    await db.insert(tradesTable).values({
      userId,
      symbol,
      strikePrice: strikePrice.toString(),
      optionType,
      action,
      quantity,
      entryPrice: executionPrice.toString(),
      status: "open",
      expiry,
    });
  } else {
    // Sell — close existing position
    const positions = await db.select().from(positionsTable)
      .where(and(
        eq(positionsTable.userId, userId),
        eq(positionsTable.symbol, symbol),
        eq(positionsTable.strikePrice, strikePrice.toString()),
        eq(positionsTable.optionType, optionType),
        eq(positionsTable.expiry, expiry),
        eq(positionsTable.status, "open")
      )).limit(1);

    if (positions.length > 0) {
      const pos = positions[0];
      const pnl = (executionPrice - parseFloat(pos.averagePrice)) * quantity;
      const totalReturn = totalCost + pnl;

      await db.update(positionsTable).set({
        status: "closed",
        pnl: pnl.toString(),
        unrealizedPnl: "0",
        currentPrice: executionPrice.toString(),
        closedAt: new Date(),
      }).where(eq(positionsTable.id, pos.id));

      // Credit balance
      await db.execute(`UPDATE users SET balance = balance + ${totalReturn} WHERE id = ${userId}`);

      // Record trade
      await db.insert(tradesTable).values({
        userId,
        symbol,
        strikePrice: strikePrice.toString(),
        optionType,
        action: "sell",
        quantity,
        entryPrice: pos.averagePrice,
        exitPrice: executionPrice.toString(),
        pnl: pnl.toString(),
        status: "closed",
        expiry,
        closedAt: new Date(),
      });
    }
  }
}

router.get("/:id", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const id = parseInt(req.params.id);
  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, userId))).limit(1);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(serializeOrder(order));
});

router.delete("/:id", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const id = parseInt(req.params.id);
  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, userId))).limit(1);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (order.status !== "pending") {
    res.status(400).json({ error: "Only pending orders can be cancelled" });
    return;
  }
  const [updated] = await db.update(ordersTable).set({ status: "cancelled" })
    .where(eq(ordersTable.id, id)).returning();
  res.json(serializeOrder(updated));
});

export { router as ordersRouter };
