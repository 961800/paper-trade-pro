import { db } from "@workspace/db";
import { ordersTable, positionsTable, tradesTable, notificationsTable } from "@workspace/db";
import { eq, and, or, isNotNull } from "drizzle-orm";
import { getCurrentOptionPrice } from "./upstox-client";
import { executeOrder } from "./order-executor";
import { logger } from "./logger";

let runnerInterval: NodeJS.Timeout | null = null;

export async function checkAndExecuteBracketOrders() {
  try {
    const openPositions = await db.select().from(positionsTable)
      .where(and(
        eq(positionsTable.status, "open"),
        or(
          isNotNull(positionsTable.stopLoss),
          isNotNull(positionsTable.targetPrice),
          isNotNull(positionsTable.trailingStop)
        )
      ));

    if (openPositions.length === 0) return;

    for (const pos of openPositions) {
      try {
        const strike = parseFloat(pos.strikePrice);
        const ltp = await getCurrentOptionPrice(
          pos.symbol,
          strike,
          pos.optionType as "CE" | "PE",
          pos.expiry
        );

        if (ltp <= 0) continue;

        let currentSL = pos.stopLoss ? parseFloat(pos.stopLoss) : null;
        const currentTarget = pos.targetPrice ? parseFloat(pos.targetPrice) : null;
        const trailingStop = pos.trailingStop ? parseFloat(pos.trailingStop) : null;
        let highWaterMark = pos.highWaterMark ? parseFloat(pos.highWaterMark) : parseFloat(pos.averagePrice);

        // Check trailing stop update
        if (trailingStop && ltp > highWaterMark) {
          highWaterMark = ltp;
          const calculatedSL = Math.round((ltp - trailingStop) * 100) / 100;
          if (!currentSL || calculatedSL > currentSL) {
            currentSL = calculatedSL;
            await db.update(positionsTable).set({
              highWaterMark: highWaterMark.toString(),
              stopLoss: currentSL.toString(),
            }).where(eq(positionsTable.id, pos.id));
          }
        }

        let triggerType: "stop_loss" | "profit_target" | null = null;
        if (currentSL !== null && ltp <= currentSL) {
          triggerType = "stop_loss";
        } else if (currentTarget !== null && ltp >= currentTarget) {
          triggerType = "profit_target";
        }

        if (triggerType) {
          const avgPrice = parseFloat(pos.averagePrice);
          const pnl = (ltp - avgPrice) * pos.quantity;
          const proceeds = ltp * pos.quantity;

          // 1. Close position
          await db.update(positionsTable).set({
            status: "closed",
            currentPrice: ltp.toString(),
            pnl: pnl.toString(),
            unrealizedPnl: "0",
            closedAt: new Date(),
          }).where(eq(positionsTable.id, pos.id));

          // 2. Credit balance
          await db.execute(`UPDATE users SET balance = balance + ${proceeds} WHERE id = ${pos.userId}`);

          // 3. Record trade
          await db.insert(tradesTable).values({
            userId: pos.userId,
            symbol: pos.symbol,
            strikePrice: pos.strikePrice,
            optionType: pos.optionType,
            action: "sell",
            quantity: pos.quantity,
            entryPrice: pos.averagePrice,
            exitPrice: ltp.toString(),
            pnl: pnl.toString(),
            status: "closed",
            expiry: pos.expiry,
            strategy: triggerType === "stop_loss" ? "SL Hit" : "Target Hit",
            closedAt: new Date(),
          });

          // 4. Record notification
          const isProfit = triggerType === "profit_target";
          const title = isProfit ? "🎯 Profit Target Hit!" : "🚨 Stop-Loss Triggered!";
          const pnlText = pnl >= 0 ? `+₹${pnl.toFixed(2)}` : `-₹${Math.abs(pnl).toFixed(2)}`;
          await db.insert(notificationsTable).values({
            userId: pos.userId,
            type: triggerType,
            title,
            message: `${pos.symbol} ${pos.strikePrice} ${pos.optionType} auto-squared off at ₹${ltp.toFixed(2)} (${isProfit ? `Target: ₹${currentTarget}` : `SL: ₹${currentSL}`}) | P&L: ${pnlText}`,
            isRead: false,
          });

          logger.info(`[Bracket Runner] ${title} for pos ${pos.id} user ${pos.userId} at ₹${ltp}`);
        }
      } catch (err: any) {
        logger.error({ err, posId: pos.id }, "[Bracket Runner] Error processing position bracket");
      }
    }
  } catch (err: any) {
    logger.error({ err }, "[Bracket Runner] Error checking bracket orders");
  }
}

export async function checkAndExecuteLimitOrders() {
  try {
    // 1. Fetch all pending limit orders
    const pendingOrders = await db.select().from(ordersTable)
      .where(eq(ordersTable.status, "pending"));

    if (pendingOrders.length === 0) return;

    logger.debug(`[Limit Order Runner] Checking ${pendingOrders.length} pending orders...`);

    for (const order of pendingOrders) {
      try {
        const strike = parseFloat(order.strikePrice);
        
        // 2. Fetch current live price (LTP) for the option contract
        const ltp = await getCurrentOptionPrice(
          order.symbol,
          strike,
          order.optionType as "CE" | "PE",
          order.expiry
        );

        if (ltp <= 0) continue;

        const limitPrice = parseFloat(order.limitPrice ?? "0");
        let shouldExecute = false;

        // 3. Evaluate limit order triggers
        if (order.action === "buy") {
          // Buy limit: Trigger when price falls to or below limitPrice
          if (ltp <= limitPrice) {
            shouldExecute = true;
          }
        } else if (order.action === "sell") {
          // Sell limit: Trigger when price rises to or above limitPrice
          if (ltp >= limitPrice) {
            shouldExecute = true;
          }
        }

        if (shouldExecute) {
          logger.info(`[Limit Order Runner] Triggered order ID ${order.id} for user ${order.userId}: ${order.symbol} ${order.strikePrice} ${order.optionType} at limit ₹${limitPrice} (LTP: ₹${ltp})`);

          // 4. Update order status to executed
          await db.update(ordersTable).set({
            status: "executed",
            executedPrice: ltp.toString(),
            executedAt: new Date()
          }).where(eq(ordersTable.id, order.id));

          // 5. Execute position update & balance update
          await executeOrder(
            order.userId,
            order.id,
            order.symbol,
            strike,
            order.optionType,
            order.action,
            order.quantity,
            ltp,
            order.expiry,
            order.stopLoss ? parseFloat(order.stopLoss) : null,
            order.targetPrice ? parseFloat(order.targetPrice) : null,
            order.trailingStop ? parseFloat(order.trailingStop) : null
          );

          // 6. Record notification
          await db.insert(notificationsTable).values({
            userId: order.userId,
            type: "order_executed",
            title: "Limit Order Executed",
            message: `Limit ${order.action.toUpperCase()} ${order.quantity} ${order.symbol} ${order.strikePrice} ${order.optionType} executed at ₹${ltp.toFixed(2)} (Limit: ₹${limitPrice.toFixed(2)})`,
            isRead: false
          });
        }
      } catch (err: any) {
        logger.error({ err, orderId: order.id }, "[Limit Order Runner] Error processing order");
      }
    }
  } catch (err: any) {
    logger.error({ err }, "[Limit Order Runner] Error fetching pending orders");
  }
}

export function startOrderRunner(intervalMs = 4000) {
  if (runnerInterval) return;
  logger.info("[Order Runner] Starting background order & bracket runner...");
  runnerInterval = setInterval(async () => {
    await checkAndExecuteLimitOrders();
    await checkAndExecuteBracketOrders();
  }, intervalMs);
}

export function stopOrderRunner() {
  if (runnerInterval) {
    clearInterval(runnerInterval);
    runnerInterval = null;
    logger.info("[Limit Order Runner] Stopped background runner.");
  }
}
