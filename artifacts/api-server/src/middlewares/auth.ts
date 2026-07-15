import { Request, Response, NextFunction } from "express";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}
