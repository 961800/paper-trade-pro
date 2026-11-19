import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, positionsTable } from "@workspace/db";
import { eq, or, and, ilike } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import { createSession, setSessionCookie, clearSession, getSessionId } from "../lib/auth";
import { sendEmailOtp } from "../lib/mailer";

const router = Router();

interface OTPEntry { otp: string; expiresAt: number; attempts: number; lockedUntil?: number }
const otpStore = new Map<string, OTPEntry>();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "papertrade_salt_2024").digest("hex");
}

const phoneRegex = /^[6-9]\d{9}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fullNameRegex = /^[a-zA-Z\s]+$/;

export async function serializeUser(user: typeof usersTable.$inferSelect) {
  const openPositions = await db
    .select({ currentPrice: positionsTable.currentPrice, quantity: positionsTable.quantity })
    .from(positionsTable)
    .where(and(eq(positionsTable.userId, user.id), eq(positionsTable.status, "open")));

  const openPositionsMarketValue = openPositions.reduce(
    (sum, p) => sum + parseFloat(p.currentPrice) * p.quantity,
    0,
  );
  const balance = parseFloat(user.balance);
  const portfolioValue = Math.round((balance + openPositionsMarketValue) * 100) / 100;

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? null,
    age: user.age ?? null,
    city: user.city ?? null,
    balance,
    initialCapital: parseFloat(user.initialCapital),
    portfolioValue,
    stopLossLimit: user.stopLossLimit ? parseFloat(user.stopLossLimit) : null,
    targetPrice: user.targetPrice ? parseFloat(user.targetPrice) : null,
    maxDailyLoss: user.maxDailyLoss ? parseFloat(user.maxDailyLoss) : null,
    killSwitchActive: user.killSwitchActive ?? false,
    maxDailyTrades: user.maxDailyTrades ?? 20,
    createdAt: user.createdAt.toISOString(),
  };
}

// GET /auth/me — session-based
router.get("/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(await serializeUser(req.user));
});

// POST /auth/send-otp
router.post("/send-otp", async (req, res): Promise<void> => {
  const schema = z.object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }).refine((data) => data.email || data.phone, {
    message: "Email or mobile number is required.",
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors[0]?.message ?? "Please provide a valid email or mobile number." });
    return;
  }

  const { email, phone } = parse.data;
  const cleanEmail = email ? email.trim().toLowerCase() : "";
  const cleanPhone = phone ? phone.trim() : "";
  const primaryKey = cleanEmail || cleanPhone;

  const existing = otpStore.get(primaryKey);
  if (existing?.lockedUntil && Date.now() < existing.lockedUntil) {
    const rem = Math.ceil((existing.lockedUntil - Date.now()) / 60000);
    res.status(429).json({ error: `OTP locked due to previous failed attempts. Try again in ${rem} minute(s).` });
    return;
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  const entry: OTPEntry = { otp, expiresAt, attempts: 0 };
  if (cleanEmail) otpStore.set(cleanEmail, entry);
  if (cleanPhone) otpStore.set(cleanPhone, entry);

  let mailResult = { success: true, message: "", mode: "fallback" as const };
  if (cleanEmail) {
    mailResult = await sendEmailOtp(cleanEmail, otp);
  }

  res.json({
    success: true,
    message: cleanEmail
      ? (mailResult.mode === "smtp"
          ? `Verification OTP sent to your Gmail inbox: ${cleanEmail}`
          : `Verification code ready for ${cleanEmail}`)
      : `OTP sent to mobile: ${cleanPhone}`,
    email: cleanEmail || undefined,
    otp: mailResult.mode === "fallback" ? otp : undefined,
    mode: mailResult.mode,
  });
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
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors[0]?.message ?? "Invalid input" });
    return;
  }
  const { fullName, email, password, phone, age, city, otp, initialCapital } = parse.data;

  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();
  const cleanPhone = phone.trim();

  // Validate OTP strictly against cleanEmail first, then cleanPhone
  const entry = otpStore.get(cleanEmail) || otpStore.get(cleanPhone);
  if (!entry) {
    res.status(400).json({ error: "Verification code not requested for this email. Please click Send OTP first." });
    return;
  }
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    res.status(429).json({ error: "Too many failed OTP attempts. Account registration locked for 5 minutes." });
    return;
  }
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(cleanEmail);
    otpStore.delete(cleanPhone);
    res.status(400).json({ error: "Verification code expired. Please request a new OTP." });
    return;
  }

  entry.attempts++;
  if (entry.otp !== otp) {
    if (entry.attempts >= 3) {
      entry.lockedUntil = Date.now() + 5 * 60 * 1000;
      res.status(400).json({ error: "Incorrect OTP. Maximum attempts reached. Locked for 5 minutes." });
    } else {
      res.status(400).json({ error: `Incorrect Gmail OTP. ${3 - entry.attempts} attempt(s) remaining.` });
    }
    return;
  }

  // OTP verified successfully! Clear stored OTP
  otpStore.delete(cleanEmail);
  otpStore.delete(cleanPhone);

  const dup = await db.select().from(usersTable)
    .where(or(ilike(usersTable.email, cleanEmail), eq(usersTable.phone, cleanPhone)))
    .limit(1);
  if (dup.length > 0) {
    res.status(409).json({
      error: dup[0].email.toLowerCase() === cleanEmail
        ? "Email is already registered. Please login instead."
        : "Mobile number is already registered.",
    });
    return;
  }

  const capital = Math.round(initialCapital ?? 100000).toString();
  const [user] = await db.insert(usersTable).values({
    fullName: fullName.trim(),
    email: cleanEmail,
    passwordHash: hashPassword(cleanPassword),
    phone: cleanPhone,
    age,
    city: city.trim(),
    balance: capital,
    initialCapital: capital,
  }).returning();

  const sid = await createSession({ userId: user.id });
  setSessionCookie(res, sid);
  res.status(201).json({ user: await serializeUser(user), token: sid });
});

// POST /auth/login
router.post("/login", async (req, res): Promise<void> => {
  const parse = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { email, password } = parse.data;

  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();

  const [user] = await db.select().from(usersTable)
    .where(or(eq(usersTable.email, cleanEmail), ilike(usersTable.email, cleanEmail)))
    .limit(1);

  if (!user || (user.passwordHash !== hashPassword(cleanPassword) && user.passwordHash !== hashPassword(password))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const sid = await createSession({ userId: user.id });
  setSessionCookie(res, sid);
  res.json({ user: await serializeUser(user), token: sid });
});

// POST /auth/logout
router.post("/logout", async (req, res): Promise<void> => {
  const sid = getSessionId(req);
  if (sid) {
    await clearSession(res, sid);
  }
  res.clearCookie("sid", { path: "/", secure: true, sameSite: "none" });
  res.clearCookie("sid", { path: "/" });
  res.json({ success: true, message: "Logged out successfully" });
});

// PATCH /auth/profile
router.patch("/profile", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = req.userId!;
  const { fullName, phone, city, stopLossLimit, targetPrice, maxDailyLoss, killSwitchActive, maxDailyTrades } = req.body;
  const updateData: Record<string, unknown> = {};
  if (fullName) updateData.fullName = fullName;
  if (phone) updateData.phone = phone;
  if (city) updateData.city = city;
  if (stopLossLimit !== undefined) updateData.stopLossLimit = stopLossLimit?.toString() ?? null;
  if (targetPrice !== undefined) updateData.targetPrice = targetPrice?.toString() ?? null;
  if (maxDailyLoss !== undefined) updateData.maxDailyLoss = maxDailyLoss?.toString() ?? null;
  if (killSwitchActive !== undefined) updateData.killSwitchActive = Boolean(killSwitchActive);
  if (maxDailyTrades !== undefined) updateData.maxDailyTrades = Number(maxDailyTrades);
  const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, userId)).returning();
  res.json(await serializeUser(user));
});

// POST /auth/kill-switch/toggle
router.post("/kill-switch/toggle", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = req.userId!;
  const newStatus = !req.user.killSwitchActive;
  const [user] = await db.update(usersTable).set({ killSwitchActive: newStatus }).where(eq(usersTable.id, userId)).returning();
  res.json({
    killSwitchActive: user.killSwitchActive,
    message: newStatus ? "🚨 Emergency Kill Switch ACTIVATED. Trading is locked." : "✅ Emergency Kill Switch DEACTIVATED. Trading is resumed."
  });
});

export { router as authRouter };
