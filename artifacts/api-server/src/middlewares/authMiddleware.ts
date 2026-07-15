import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSession, getSessionId, clearSession } from "../lib/auth";

export type AppUser = typeof usersTable.$inferSelect;

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      user?: AppUser;
      isAuthenticated: () => boolean;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  req.isAuthenticated = function () { return this.userId != null; };

  const sid = getSessionId(req);
  if (!sid) { next(); return; }

  const session = await getSession(sid);
  if (!session?.userId) {
    await clearSession(res, sid);
    next();
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId)).limit(1);
  if (!user) {
    await clearSession(res, sid);
    next();
    return;
  }

  req.user = user;
  req.userId = user.id;
  next();
}
