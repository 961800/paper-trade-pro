import { Router, Request } from "express";
import { db } from "@workspace/db";
import { watchlistTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

interface AuthReq extends Request {
  userId: number;
  user: typeof usersTable.$inferSelect;
}

function serializeWatchlist(item: typeof watchlistTable.$inferSelect) {
  return {
    id: item.id,
    userId: item.userId,
    symbol: item.symbol,
    name: item.name,
    type: item.type,
    createdAt: item.createdAt.toISOString(),
  };
}

router.use(requireAuth);

router.get("/", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const items = await db.select().from(watchlistTable)
    .where(eq(watchlistTable.userId, userId))
    .orderBy(desc(watchlistTable.createdAt));
  res.json(items.map(serializeWatchlist));
});

router.post("/", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const { symbol, name, type } = req.body;
  if (!symbol || !name) {
    res.status(400).json({ error: "Symbol and name are required" });
    return;
  }
  const [item] = await db.insert(watchlistTable).values({
    userId,
    symbol,
    name,
    type: type ?? "index",
  }).returning();
  res.status(201).json(serializeWatchlist(item));
});

router.delete("/:id", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const id = parseInt(req.params.id);
  await db.delete(watchlistTable)
    .where(and(eq(watchlistTable.id, id), eq(watchlistTable.userId, userId)));
  res.json({ success: true, message: "Removed from watchlist" });
});

export { router as watchlistRouter };
