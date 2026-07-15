import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, positionsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/users", requireAuth, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));

  const openPositionRows = await db
    .select({
      userId: positionsTable.userId,
      openCount: sql<number>`cast(count(*) as int)`,
      marketValue: sql<number>`coalesce(sum(cast(${positionsTable.currentPrice} as numeric) * ${positionsTable.quantity}), 0)`,
    })
    .from(positionsTable)
    .where(eq(positionsTable.status, "open"))
    .groupBy(positionsTable.userId);

  const posMap = new Map(openPositionRows.map((r) => [r.userId, r]));

  const result = users.map((u) => {
    const pos = posMap.get(u.id);
    const balance = parseFloat(u.balance);
    const initialCapital = parseFloat(u.initialCapital);
    const marketValue = pos ? Number(pos.marketValue) : 0;
    const portfolioValue = Math.round((balance + marketValue) * 100) / 100;
    const totalPnl = Math.round((portfolioValue - initialCapital) * 100) / 100;

    return {
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone ?? null,
      city: u.city ?? null,
      balance,
      initialCapital,
      portfolioValue,
      totalPnl,
      openPositionsCount: pos ? pos.openCount : 0,
      createdAt: u.createdAt.toISOString(),
    };
  });

  res.json({ users: result });
});

export { router as adminRouter };
