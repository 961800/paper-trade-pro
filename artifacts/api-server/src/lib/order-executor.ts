import { db } from "@workspace/db";
import { positionsTable, tradesTable, ordersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export async function executeOrder(
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
  if (action === "buy") {
    const totalCost = executionPrice * quantity;
    // Deduct cost from balance
    await db.execute(`UPDATE users SET balance = balance - ${totalCost} WHERE id = ${userId}`);

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
    // SELL path
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
      const soldQty = Math.min(quantity, pos.quantity);
      const proceeds = executionPrice * soldQty;
      const pnl = (executionPrice - parseFloat(pos.averagePrice)) * soldQty;

      // Credit sell proceeds to balance
      await db.execute(`UPDATE users SET balance = balance + ${proceeds} WHERE id = ${userId}`);

      if (soldQty < pos.quantity) {
        // Partial sell — update position quantity
        await db.update(positionsTable).set({
          quantity: pos.quantity - soldQty,
          currentPrice: executionPrice.toString(),
          unrealizedPnl: ((executionPrice - parseFloat(pos.averagePrice)) * (pos.quantity - soldQty)).toString(),
        }).where(eq(positionsTable.id, pos.id));
      } else {
        // Full close
        await db.update(positionsTable).set({
          status: "closed",
          pnl: pnl.toString(),
          unrealizedPnl: "0",
          currentPrice: executionPrice.toString(),
          closedAt: new Date(),
        }).where(eq(positionsTable.id, pos.id));
      }

      await db.insert(tradesTable).values({
        userId,
        symbol,
        strikePrice: strikePrice.toString(),
        optionType,
        action: "sell",
        quantity: soldQty,
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
