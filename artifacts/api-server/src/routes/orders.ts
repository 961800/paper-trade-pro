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
    trailingStop: order.trailingStop ? parseFloat(order.trailingStop) : null,
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
  limitPrice:   z.number().positive().optional().nullable(),
  stopLoss:     z.number().positive().optional().nullable(),
  targetPrice:  z.number().positive().optional().nullable(),
  trailingStop: z.number().positive().optional().nullable(),
  strategy:     z.string().optional().nullable(),
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
  const { symbol, strikePrice, optionType, orderType, action, quantity, expiry, limitPrice, stopLoss, targetPrice, trailingStop, strategy } = parse.data;

  // 1. Check Kill Switch
  if (user.killSwitchActive) {
    res.status(403).json({
      error: "Trading is locked: Emergency Kill Switch is ACTIVE. Disable it in Settings/Profile to resume trading."
    });
    return;
  }

  // 2. Check Daily Max Loss
  if (user.maxDailyLoss && parseFloat(user.maxDailyLoss) > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const closedToday = await db.select().from(tradesTable)
      .where(and(eq(tradesTable.userId, userId), eq(tradesTable.status, "closed")));
    const todayRealizedPnl = closedToday
      .filter(t => new Date(t.closedAt ?? t.createdAt) >= today)
      .reduce((sum, t) => sum + (t.pnl ? parseFloat(t.pnl) : 0), 0);

    const openPositions = await db.select().from(positionsTable)
      .where(and(eq(positionsTable.userId, userId), eq(positionsTable.status, "open")));
    const unrealizedPnl = openPositions.reduce((sum, p) => sum + (parseFloat(p.currentPrice) - parseFloat(p.averagePrice)) * p.quantity, 0);

    const netTodayPnl = todayRealizedPnl + unrealizedPnl;
    if (netTodayPnl < 0 && Math.abs(netTodayPnl) >= parseFloat(user.maxDailyLoss)) {
      res.status(403).json({
        error: `Daily Loss Limit Exceeded! Your maximum allowed daily loss of ₹${parseFloat(user.maxDailyLoss).toLocaleString("en-IN")} was reached (Today's Net P&L: -₹${Math.abs(netTodayPnl).toFixed(2)}). Trading is locked for today to protect your capital.`
      });
      return;
    }
  }

  // 3. Check Max Daily Trades
  const maxTrades = user.maxDailyTrades ?? 20;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTrades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId));
  const todayTradesCount = todayTrades.filter(t => new Date(t.createdAt) >= todayStart).length;
  if (todayTradesCount >= maxTrades) {
    res.status(403).json({
      error: `Daily Trade Cap Reached! You have completed ${todayTradesCount} trades today (Limit: ${maxTrades}). Take a break to prevent overtrading!`
    });
    return;
  }

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
    trailingStop: trailingStop?.toString() ?? null,
    status,
    expiry,
    executedAt: orderType === "market" ? new Date() : null,
  }).returning();

  if (orderType === "market" && finalExecutionPrice) {
    await executeOrder(userId, order.id, symbol, strikePrice, optionType, action, quantity, finalExecutionPrice, expiry, stopLoss, targetPrice, trailingStop, strategy);
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

// Multi-leg batch orders
const batchOrderSchema = z.object({
  strategyName: z.string().optional(),
  orders: z.array(orderSchema).min(1, "At least 1 order leg required").max(6, "Max 6 legs allowed"),
});

router.post("/batch", async (req: Request, res): Promise<void> => {
  const authReq = req as AuthReq;
  const userId = authReq.userId;
  const user = authReq.user;

  const parse = batchOrderSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors[0]?.message ?? "Invalid batch orders" });
    return;
  }
  const { strategyName, orders } = parse.data;

  if (user.killSwitchActive) {
    res.status(403).json({ error: "Trading is locked: Emergency Kill Switch is ACTIVE." });
    return;
  }

  const results = [];
  for (const leg of orders) {
    const currentPrice = await getCurrentOptionPrice(leg.symbol, leg.strikePrice, leg.optionType as "CE" | "PE", leg.expiry);
    const finalExecutionPrice = leg.orderType === "market" ? currentPrice : (leg.limitPrice ?? currentPrice);
    const [order] = await db.insert(ordersTable).values({
      userId,
      symbol: leg.symbol,
      strikePrice: leg.strikePrice.toString(),
      optionType: leg.optionType,
      orderType: leg.orderType,
      action: leg.action,
      quantity: leg.quantity,
      executedPrice: finalExecutionPrice.toString(),
      limitPrice: leg.limitPrice?.toString() ?? null,
      stopLoss: leg.stopLoss?.toString() ?? null,
      targetPrice: leg.targetPrice?.toString() ?? null,
      trailingStop: leg.trailingStop?.toString() ?? null,
      status: "executed",
      expiry: leg.expiry,
      executedAt: new Date(),
    }).returning();

    await executeOrder(
      userId,
      order.id,
      leg.symbol,
      leg.strikePrice,
      leg.optionType,
      leg.action,
      leg.quantity,
      finalExecutionPrice,
      leg.expiry,
      leg.stopLoss,
      leg.targetPrice,
      leg.trailingStop,
      strategyName ?? "Multi-Leg"
    );

    results.push(serializeOrder(order));
  }

  await db.insert(notificationsTable).values({
    userId,
    type: "order_executed",
    title: `Strategy Executed: ${strategyName ?? "Multi-Leg"}`,
    message: `Executed ${orders.length} legs for ${orders[0].symbol} successfully.`,
    isRead: false,
  });

  res.status(201).json({ success: true, count: results.length, orders: results });
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
