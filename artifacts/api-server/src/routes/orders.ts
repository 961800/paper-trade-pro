import { Router, Request } from "express";
import { db } from "@workspace/db";
import { ordersTable, positionsTable, tradesTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getCurrentOptionPrice, getMarketStatus } from "../lib/upstox-client";
import { z } from "zod";
import { executeOrder } from "../lib/order-executor";

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
  symbol:      z.enum(["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"]),
  strikePrice: z.number().positive("Strike price must be positive"),
  optionType:  z.enum(["CE", "PE"]),
  orderType:   z.enum(["market", "limit"]),
  action:      z.enum(["buy", "sell"]),
  quantity:    z.number().int().min(1, "Quantity must be at least 1"),
  expiry:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid expiry date format"),
  limitPrice:  z.number().positive().optional().nullable(),
  stopLoss:    z.number().positive().optional().nullable(),
  targetPrice: z.number().positive().optional().nullable(),
});

router.use(requireAuth);

router.get("/", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const { status, limit } = req.query as { status?: string; limit?: string };
  const orders = await db.select().from(ordersTable)
    .where(status
      ? and(eq(ordersTable.userId, userId), eq(ordersTable.status, status))
      : eq(ordersTable.userId, userId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit ? parseInt(limit) : 100);
  res.json(orders.map(serializeOrder));
});

router.post("/", async (req: Request, res): Promise<void> => {
  const authReq = req as AuthReq;
  const userId = authReq.userId;
  const user = authReq.user;

  // Validate input
  const parse = orderSchema.safeParse(req.body);
  if (!parse.success) {
    const firstError = parse.error.errors[0]?.message ?? "Invalid order data";
    res.status(400).json({ error: firstError });
    return;
  }
  const { symbol, strikePrice, optionType, orderType, action, quantity, expiry, limitPrice, stopLoss, targetPrice } = parse.data;

  // Check market status — allow orders at any time in paper trading,
  // but warn when market is closed (still process for simulation purposes)
  const { status: mktStatus, message: mktMessage } = getMarketStatus();
  if (mktStatus === "weekend" || mktStatus === "holiday") {
    res.status(400).json({ error: `Market is ${mktStatus}. ${mktMessage}. Trading is disabled.` });
    return;
  }

  // Check contract is not expired
  const expiryDate = new Date(expiry);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (expiryDate < today) {
    res.status(400).json({ error: "Cannot place orders on expired contracts." });
    return;
  }

  // Prevent zero or negative quantity
  if (quantity <= 0) {
    res.status(400).json({ error: "Quantity must be greater than zero." });
    return;
  }

  const currentPrice = await getCurrentOptionPrice(symbol, strikePrice, optionType as "CE" | "PE", expiry);
  const executionPrice = orderType === "market" ? currentPrice : (limitPrice ?? currentPrice);
  const currentBalance = parseFloat(user.balance);

  if (action === "buy") {
    const totalCost = currentPrice * quantity;
    if (totalCost > currentBalance) {
      res.status(400).json({
        error: `Insufficient balance. Required: ₹${totalCost.toFixed(2)}, Available: ₹${currentBalance.toFixed(2)}`,
      });
      return;
    }
  }

  if (action === "sell") {
    // Must have an open position to sell
    const heldPositions = await db.select().from(positionsTable)
      .where(and(
        eq(positionsTable.userId, userId),
        eq(positionsTable.symbol, symbol),
        eq(positionsTable.strikePrice, strikePrice.toString()),
        eq(positionsTable.optionType, optionType),
        eq(positionsTable.expiry, expiry),
        eq(positionsTable.status, "open")
      )).limit(1);

    if (!heldPositions.length) {
      res.status(400).json({ error: "No open position found for this instrument." });
      return;
    }
    if (heldPositions[0].quantity < quantity) {
      res.status(400).json({
        error: `Insufficient quantity. You hold ${heldPositions[0].quantity}, cannot sell ${quantity}.`,
      });
      return;
    }
  }

  // Prevent duplicate pending orders for same instrument
  if (orderType === "limit") {
    const existingPending = await db.select().from(ordersTable)
      .where(and(
        eq(ordersTable.userId, userId),
        eq(ordersTable.symbol, symbol),
        eq(ordersTable.strikePrice, strikePrice.toString()),
        eq(ordersTable.optionType, optionType),
        eq(ordersTable.expiry, expiry),
        eq(ordersTable.action, action),
        eq(ordersTable.status, "pending")
      )).limit(1);
    if (existingPending.length > 0) {
      res.status(400).json({ error: "A pending order already exists for this instrument. Cancel it first." });
      return;
    }
  }

  const finalExecutionPrice = orderType === "market" ? currentPrice : null;
  const status = orderType === "market" ? "executed" : "pending";

  const [order] = await db.insert(ordersTable).values({
    userId,
    symbol,
    strikePrice: strikePrice.toString(),
    optionType,
    orderType,
    action,
    quantity,
    executedPrice: finalExecutionPrice?.toString() ?? null,
    limitPrice: limitPrice?.toString() ?? null,
    stopLoss: stopLoss?.toString() ?? null,
    targetPrice: targetPrice?.toString() ?? null,
    status,
    expiry,
    executedAt: orderType === "market" ? new Date() : null,
  }).returning();

  if (orderType === "market" && finalExecutionPrice) {
    await executeOrder(userId, order.id, symbol, strikePrice, optionType, action, quantity, finalExecutionPrice, expiry);
  }

  await db.insert(notificationsTable).values({
    userId,
    type: "order_executed",
    title: orderType === "market" ? "Order Executed" : "Order Placed",
    message: `${action.toUpperCase()} ${quantity} ${symbol} ${strikePrice} ${optionType} @ ₹${(finalExecutionPrice ?? limitPrice ?? currentPrice).toFixed(2)}`,
    isRead: false,
  });

  res.status(201).json(serializeOrder(order));
});


router.get("/:id", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const id = parseInt(req.params.id as string);
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
  const id = parseInt(req.params.id as string);
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
