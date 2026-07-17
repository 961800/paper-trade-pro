import { db } from "@workspace/db";
import { ordersTable, notificationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getCurrentOptionPrice } from "./upstox-client";
import { executeOrder } from "./order-executor";
import { logger } from "./logger";

let runnerInterval: NodeJS.Timeout | null = null;

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
            order.expiry
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
  logger.info("[Limit Order Runner] Starting background limit order runner...");
  runnerInterval = setInterval(checkAndExecuteLimitOrders, intervalMs);
}

export function stopOrderRunner() {
  if (runnerInterval) {
    clearInterval(runnerInterval);
    runnerInterval = null;
    logger.info("[Limit Order Runner] Stopped background runner.");
  }
}
