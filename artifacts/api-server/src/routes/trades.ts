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

function serializeTrade(trade: typeof tradesTable.$inferSelect) {
  return {
    id: trade.id,
    userId: trade.userId,
    symbol: trade.symbol,
    strikePrice: parseFloat(trade.strikePrice),
    optionType: trade.optionType,
    action: trade.action,
    quantity: trade.quantity,
    entryPrice: parseFloat(trade.entryPrice),
    exitPrice: trade.exitPrice ? parseFloat(trade.exitPrice) : null,
    pnl: trade.pnl ? parseFloat(trade.pnl) : null,
    status: trade.status,
    expiry: trade.expiry,
    createdAt: trade.createdAt.toISOString(),
    closedAt: trade.closedAt ? trade.closedAt.toISOString() : null,
  };
}

router.use(requireAuth);

router.get("/", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const { limit, offset } = req.query as { limit?: string; offset?: string };

  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.userId, userId))
    .orderBy(desc(tradesTable.createdAt))
    .limit(limit ? parseInt(limit) : 50)
    .offset(offset ? parseInt(offset) : 0);

  res.json(trades.map(serializeTrade));
});

export { router as tradesRouter };
