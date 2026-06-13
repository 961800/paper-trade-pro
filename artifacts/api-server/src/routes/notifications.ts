import { Router, Request } from "express";
import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

interface AuthReq extends Request {
  userId: number;
  user: typeof usersTable.$inferSelect;
}

function serializeNotification(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  };
}

router.use(requireAuth);

router.get("/", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const notifications = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(notifications.map(serializeNotification));
});

router.patch("/:id/read", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  const id = parseInt(req.params.id);
  const [updated] = await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(serializeNotification(updated));
});

router.post("/read-all", async (req: Request, res): Promise<void> => {
  const userId = (req as AuthReq).userId;
  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, userId));
  res.json({ success: true, message: "All notifications marked as read" });
});

export { router as notificationsRouter };
