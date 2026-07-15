import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import { createSession, setSessionCookie } from "../lib/auth";

const router = Router();

interface OTPEntry { otp: string; expiresAt: number; attempts: number; lockedUntil?: number }
const otpStore = new Map<string, OTPEntry>();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "papertrade_salt_2024").digest("hex");
}

const phoneRegex = /^[6-9]\d{9}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fullNameRegex = /^[a-zA-Z\s]+$/;

export function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? null,
    age: user.age ?? null,
    city: user.city ?? null,
    balance: parseFloat(user.balance),
    initialCapital: parseFloat(user.initialCapital),
    stopLossLimit: user.stopLossLimit ? parseFloat(user.stopLossLimit) : null,
    targetPrice: user.targetPrice ? parseFloat(user.targetPrice) : null,
    maxDailyLoss: user.maxDailyLoss ? parseFloat(user.maxDailyLoss) : null,
    createdAt: user.createdAt.toISOString(),
  };
}

// GET /auth/me — session-based
router.get("/me", (req, res): void => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(serializeUser(req.user));
});

// POST /auth/send-otp
router.post("/send-otp", async (req, res): Promise<void> => {
  const schema = z.object({ phone: z.string().regex(phoneRegex) });
  const parse = schema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Please enter a valid Indian mobile number." }); return; }
  const { phone } = parse.data;

  const existing = otpStore.get(phone);
  if (existing?.lockedUntil && Date.now() < existing.lockedUntil) {
    const rem = Math.ceil((existing.lockedUntil - Date.now()) / 60000);
    res.status(429).json({ error: `OTP locked. Try again in ${rem} minute(s).` });
    return;
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 });
  res.json({ success: true, message: "OTP sent (Demo mode)", otp });
});

// POST /auth/register
const registerSchema = z.object({
  fullName: z.string().min(3).regex(fullNameRegex, "Please enter a valid name."),
  email: z.string().email().regex(emailRegex, "Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  phone: z.string().regex(phoneRegex, "Please enter a valid Indian mobile number."),
  age: z.number().int().min(18, "You must be at least 18 years old."),
  city: z.string().min(2, "City is required."),
  otp: z.string().length(6, "OTP must be exactly 6 digits."),
  initialCapital: z.number().min(10000).max(10000000).optional(),
});

router.post("/register", async (req, res): Promise<void> => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.errors[0]?.message ?? "Invalid input" }); return; }
  const { fullName, email, password, phone, age, city, otp, initialCapital } = parse.data;

  const entry = otpStore.get(phone);
  if (!entry) { res.status(400).json({ error: "OTP not requested." }); return; }
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) { res.status(429).json({ error: "OTP locked." }); return; }
  if (Date.now() > entry.expiresAt) { otpStore.delete(phone); res.status(400).json({ error: "OTP expired." }); return; }
  entry.attempts++;
  if (entry.otp !== otp) {
    if (entry.attempts >= 3) { entry.lockedUntil = Date.now() + 5 * 60 * 1000; res.status(400).json({ error: "Invalid OTP. Locked for 5 minutes." }); }
    else { res.status(400).json({ error: `Invalid OTP. ${3 - entry.attempts} attempt(s) remaining.` }); }
    return;
  }
  otpStore.delete(phone);

  const dup = await db.select().from(usersTable).where(or(eq(usersTable.email, email), eq(usersTable.phone, phone))).limit(1);
  if (dup.length > 0) {
    res.status(409).json({ error: dup[0].email === email ? "Email already registered." : "Phone already registered." });
    return;
  }

  const capital = Math.round(initialCapital ?? 100000).toString();
  const [user] = await db.insert(usersTable).values({
    fullName, email, passwordHash: hashPassword(password), phone, age, city,
    balance: capital, initialCapital: capital,
  }).returning();

  const sid = await createSession({ userId: user.id });
  setSessionCookie(res, sid);
  res.status(201).json({ user: serializeUser(user), token: sid });
});

// POST /auth/login
router.post("/login", async (req, res): Promise<void> => {
  const parse = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { email, password } = parse.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user || user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const sid = await createSession({ userId: user.id });
  setSessionCookie(res, sid);
  res.json({ user: serializeUser(user), token: sid });
});

// POST /auth/logout
router.post("/logout", (_req, res): void => {
  res.clearCookie("sid", { path: "/" });
  res.json({ success: true });
});

// PATCH /auth/profile
router.patch("/profile", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = req.userId!;
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

export { router as authRouter };
