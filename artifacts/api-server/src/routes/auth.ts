import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";

const router = Router();

// In-memory OTP store (phone → entry)
interface OTPEntry {
  otp: string;
  expiresAt: number;
  attempts: number;
  lockedUntil?: number;
}
const otpStore = new Map<string, OTPEntry>();

function hashPassword(password: string): string {
  const salt = "papertrade_salt_2024";
  return crypto.createHash("sha256").update(password + salt).digest("hex");
}

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

// Strict validation schemas
const fullNameRegex = /^[a-zA-Z\s]+$/;
const phoneRegex    = /^[6-9]\d{9}$/;
const emailRegex    = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const registerSchema = z.object({
  fullName: z.string()
    .min(3, "Please enter a valid name.")
    .regex(fullNameRegex, "Please enter a valid name."),
  email: z.string()
    .email("Please enter a valid email address.")
    .regex(emailRegex, "Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  phone: z.string().regex(phoneRegex, "Please enter a valid Indian mobile number."),
  age: z.number().int().min(18, "You must be at least 18 years old."),
  city: z.string().min(2, "City is required."),
  otp: z.string().length(6, "OTP must be exactly 6 digits."),
  initialCapital: z.number().min(10000, "Minimum capital is ₹10,000.").max(10000000, "Maximum capital is ₹1,00,00,000.").optional(),
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

// POST /auth/send-otp
router.post("/send-otp", async (req, res): Promise<void> => {
  const schema = z.object({
    phone: z.string().regex(phoneRegex, "Please enter a valid Indian mobile number."),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Please enter a valid Indian mobile number." });
    return;
  }
  const { phone } = parse.data;

  // Check lockout
  const existing = otpStore.get(phone);
  if (existing?.lockedUntil && Date.now() < existing.lockedUntil) {
    const remainingMin = Math.ceil((existing.lockedUntil - Date.now()) / 60000);
    res.status(429).json({ error: `OTP verification locked. Try again in ${remainingMin} minute(s).` });
    return;
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 });

  // Demo mode: return OTP in response (no SMS provider configured)
  res.json({
    success: true,
    message: "OTP sent successfully (Demo mode)",
    otp,
  });
});

// POST /auth/register
router.post("/register", async (req, res): Promise<void> => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    const firstError = parse.error.errors[0]?.message ?? "Invalid input";
    res.status(400).json({ error: firstError });
    return;
  }
  const { fullName, email, password, phone, age, city, otp, initialCapital } = parse.data;

  // Verify OTP
  const otpEntry = otpStore.get(phone);
  if (!otpEntry) {
    res.status(400).json({ error: "OTP not requested. Please request an OTP first." });
    return;
  }
  if (otpEntry.lockedUntil && Date.now() < otpEntry.lockedUntil) {
    res.status(429).json({ error: "OTP verification locked for 5 minutes. Please request a new OTP." });
    return;
  }
  if (Date.now() > otpEntry.expiresAt) {
    otpStore.delete(phone);
    res.status(400).json({ error: "OTP expired. Please request a new OTP." });
    return;
  }
  otpEntry.attempts++;
  if (otpEntry.otp !== otp) {
    if (otpEntry.attempts >= 3) {
      otpEntry.lockedUntil = Date.now() + 5 * 60 * 1000;
      res.status(400).json({ error: "Invalid OTP. Too many failed attempts — locked for 5 minutes." });
    } else {
      const remaining = 3 - otpEntry.attempts;
      res.status(400).json({ error: `Invalid OTP. ${remaining} attempt(s) remaining.` });
    }
    return;
  }
  otpStore.delete(phone);

  // Check duplicates
  const existing = await db.select().from(usersTable)
    .where(or(eq(usersTable.email, email), eq(usersTable.phone, phone)))
    .limit(1);
  if (existing.length > 0) {
    if (existing[0].email === email) {
      res.status(409).json({ error: "Email already registered." });
    } else {
      res.status(409).json({ error: "Phone number already registered." });
    }
    return;
  }

  const capital = Math.round(initialCapital ?? 100000).toString();
  const [user] = await db.insert(usersTable).values({
    fullName,
    email,
    passwordHash: hashPassword(password),
    phone,
    age,
    city,
    balance: capital,
    initialCapital: capital,
  }).returning();

  const token = generateToken(user.id);
  res.status(201).json({ user: serializeUser(user), token });
});

// POST /auth/login
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

// POST /auth/logout
router.post("/logout", (_req, res): void => {
  res.json({ success: true, message: "Logged out successfully" });
});

// GET /auth/me
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

// PATCH /auth/profile
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
