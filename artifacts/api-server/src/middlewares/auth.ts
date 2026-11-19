import { Request, Response, NextFunction } from "express";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function isUserAdmin(email: string | undefined | null): Promise<boolean> {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();

  // Primary owner accounts
  const defaultAdmins = ["singireddipavan29@gmail.com", "singireddipavan29@gamil.com"];
  if (defaultAdmins.includes(cleanEmail)) return true;

  // Environment variable ADMIN_EMAILS
  const envAdmins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (envAdmins.includes(cleanEmail)) return true;

  // Database dynamic admin_emails
  try {
    const [row] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "admin_emails"));
    if (row?.value) {
      const dbAdmins = row.value.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
      if (dbAdmins.includes(cleanEmail)) return true;
    }
  } catch {
    // Ignore db read error
  }

  return false;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const isAdmin = await isUserAdmin(req.user.email);
  if (!isAdmin) {
    res.status(403).json({ error: "Access denied. Administrator privileges required." });
    return;
  }
  next();
}
