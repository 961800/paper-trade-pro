import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  positionsTable,
  ordersTable,
  tradesTable,
  notificationsTable,
  watchlistTable,
  mentorMessagesTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { isUserAdmin, requireAdmin } from "../middlewares/auth";
import { deleteUserSessions } from "../lib/auth";

const router = Router();

// GET /api/admin/users — List all users with trading stats & status
router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
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

  const result = await Promise.all(
    users.map(async (u) => {
      const pos = posMap.get(u.id);
      const balance = parseFloat(u.balance);
      const initialCapital = parseFloat(u.initialCapital);
      const marketValue = pos ? Number(pos.marketValue) : 0;
      const portfolioValue = Math.round((balance + marketValue) * 100) / 100;
      const totalPnl = Math.round((portfolioValue - initialCapital) * 100) / 100;
      const isAdminUser = await isUserAdmin(u.email);

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
        isBanned: u.isBanned ?? false,
        killSwitchActive: u.killSwitchActive ?? false,
        isAdmin: isAdminUser,
        createdAt: u.createdAt.toISOString(),
      };
    }),
  );

  res.json({ users: result });
});

// POST /api/admin/users/:id/ban — Ban or unban a user
router.post("/users/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const isTargetAdmin = await isUserAdmin(target.email);
  if (isTargetAdmin) {
    res.status(400).json({ error: "Cannot ban or suspend an administrator account." });
    return;
  }

  const newBannedState = req.body.banned !== undefined ? Boolean(req.body.banned) : !target.isBanned;

  await db.update(usersTable).set({ isBanned: newBannedState }).where(eq(usersTable.id, targetId));

  if (newBannedState) {
    // Revoke all active sessions immediately
    await deleteUserSessions(targetId);
  }

  res.json({
    success: true,
    isBanned: newBannedState,
    message: newBannedState
      ? `User ${target.email} has been banned and all active sessions revoked.`
      : `User ${target.email} has been unbanned.`,
  });
});

// POST /api/admin/users/:id/reset-capital — Reset user virtual balance & initial capital
router.post("/users/:id/reset-capital", requireAdmin, async (req, res): Promise<void> => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const amount = Number(req.body.amount ?? 100000);
  if (isNaN(amount) || amount < 1000 || amount > 100000000) {
    res.status(400).json({ error: "Amount must be between ₹1,000 and ₹10,00,00,000" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const formattedAmount = Math.round(amount).toString();
  await db.update(usersTable).set({
    balance: formattedAmount,
    initialCapital: formattedAmount,
  }).where(eq(usersTable.id, targetId));

  res.json({
    success: true,
    balance: amount,
    initialCapital: amount,
    message: `Capital for ${target.email} reset to ₹${amount.toLocaleString("en-IN")}.`,
  });
});

// POST /api/admin/users/:id/toggle-kill-switch — Emergency trade freeze for a user
router.post("/users/:id/toggle-kill-switch", requireAdmin, async (req, res): Promise<void> => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const newKillSwitchState = req.body.active !== undefined ? Boolean(req.body.active) : !target.killSwitchActive;

  await db.update(usersTable).set({ killSwitchActive: newKillSwitchState }).where(eq(usersTable.id, targetId));

  res.json({
    success: true,
    killSwitchActive: newKillSwitchState,
    message: newKillSwitchState
      ? `Emergency kill-switch activated for ${target.email}.`
      : `Kill-switch deactivated for ${target.email}.`,
  });
});

// DELETE /api/admin/users/:id — Permanently delete user and their data
router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const isTargetAdmin = await isUserAdmin(target.email);
  if (isTargetAdmin) {
    res.status(400).json({ error: "Cannot delete an administrator account." });
    return;
  }

  // Clean up associated records
  await deleteUserSessions(targetId);
  await db.delete(ordersTable).where(eq(ordersTable.userId, targetId));
  await db.delete(positionsTable).where(eq(positionsTable.userId, targetId));
  await db.delete(tradesTable).where(eq(tradesTable.userId, targetId));
  await db.delete(notificationsTable).where(eq(notificationsTable.userId, targetId));
  await db.delete(watchlistTable).where(eq(watchlistTable.userId, targetId));
  await db.delete(mentorMessagesTable).where(eq(mentorMessagesTable.userId, targetId));
  await db.delete(usersTable).where(eq(usersTable.id, targetId));

  res.json({
    success: true,
    message: `User ${target.email} and all trading data deleted successfully.`,
  });
});

export { router as adminRouter };
