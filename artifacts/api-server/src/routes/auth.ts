import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";

const router = Router();

// Simple password hashing (SHA-256 + salt for demo purposes)
function hashPassword(password: string): string {
  const salt = "papertrade_salt_2024";
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

// Simple JWT-like token (base64 encoded payload + signature)
function generateToken(userId: number): string {
  const payload = Buffer.from(JSON.stringify({ userId, iat: Date.now() })).toString("base64");
  const sig = crypto.createHash("sha256").update(payload + (process.env.SESSION_SECRET || "secret")).digest("hex").slice(0, 16);
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): number | null {
  try {
    const [payload, sig] = token.split(".");
    const expectedSig = crypto.createHash("sha256").update(payload + (process.env.SESSION_SECRET || "secret")).digest("hex").slice(0, 16);
    if (sig !== expectedSig) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
    return decoded.userId;
  } catch {
    return null;
  }
}

const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().min(10),
  age: z.number().int().min(18),
  city: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    age: user.age,
    city: user.city,
    balance: parseFloat(user.balance),
    initialCapital: parseFloat(user.initialCapital),
    stopLossLimit: user.stopLossLimit ? parseFloat(user.stopLossLimit) : null,
    targetPrice: user.targetPrice ? parseFloat(user.targetPrice) : null,
    maxDailyLoss: user.maxDailyLoss ? parseFloat(user.maxDailyLoss) : null,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/register", async (req, res): Promise<void> => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { fullName, email, password, phone, age, city } = parse.data;
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }
  const [user] = await db.insert(usersTable).values({
    fullName,
    email,
    passwordHash: hashPassword(password),
    phone,
    age,
    city,
    balance: "100000",
    initialCapital: "100000",
  }).returning();
  const token = generateToken(user.id);
  res.status(201).json({ user: serializeUser(user), token });
});

router.post("/login", async (req, res): Promise<void> => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password } = parse.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user || user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const token = generateToken(user.id);
  res.json({ user: serializeUser(user), token });
});

router.post("/logout", (_req, res): void => {
  res.json({ success: true, message: "Logged out successfully" });
});

router.get("/me", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const userId = verifyToken(auth.slice(7));
  if (!userId) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(serializeUser(user));
});

router.patch("/profile", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const userId = verifyToken(auth.slice(7));
  if (!userId) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  const { fullName, phone, city, stopLossLimit, targetPrice, maxDailyLoss } = req.body;
  const updateData: Record<string, unknown> = {};
  if (fullName) updateData.fullName = fullName;
  if (phone) updateData.phone = phone;
  if (city) updateData.city = city;
  if (stopLossLimit !== undefined) updateData.stopLossLimit = stopLossLimit?.toString() ?? null;
  if (targetPrice !== undefined) updateData.targetPrice = targetPrice?.toString() ?? null;
  if (maxDailyLoss !== undefined) updateData.maxDailyLoss = maxDailyLoss?.toString() ?? null;
  const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, userId)).returning();
  res.json(serializeUser(user));
});

export { router as authRouter, serializeUser };
