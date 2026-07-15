import * as oidc from "openid-client";
import { Router, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createSession,
  clearSession,
  getSessionId,
  setSessionCookie,
  SESSION_TTL,
} from "../lib/auth";

const router = Router();

const ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";
const OIDC_COOKIE_TTL = 10 * 60 * 1000;

let oidcConfig: oidc.Configuration | null = null;
async function getOidcConfig(): Promise<oidc.Configuration> {
  if (!oidcConfig) {
    oidcConfig = await oidc.discovery(new URL(ISSUER_URL), process.env.REPL_ID!);
  }
  return oidcConfig;
}

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost";
  return `${proto}://${host}`;
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: OIDC_COOKIE_TTL });
}

function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

async function upsertReplitUser(claims: Record<string, unknown>) {
  const replitId = claims.sub as string;
  const email = (claims.email as string | null) ?? null;
  const firstName = (claims.first_name as string | null) ?? null;
  const lastName = (claims.last_name as string | null) ?? null;
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || email?.split("@")[0] || "Trader";

  // Check if user exists by replitId
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.replitId, replitId)).limit(1);
  if (existing) {
    const [updated] = await db.update(usersTable)
      .set({ fullName, updatedAt: new Date() })
      .where(eq(usersTable.replitId, replitId))
      .returning();
    return updated;
  }

  // Check if user exists by email (existing email/password user — link accounts)
  if (email) {
    const [byEmail] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (byEmail) {
      const [linked] = await db.update(usersTable)
        .set({ replitId, updatedAt: new Date() })
        .where(eq(usersTable.email, email))
        .returning();
      return linked;
    }
  }

  // New user — auto-create with default ₹1,00,000 capital
  const [newUser] = await db.insert(usersTable).values({
    replitId,
    fullName,
    email: email ?? `${replitId}@replit.user`,
    passwordHash: null,
    phone: null,
    age: null,
    city: null,
    balance: "100000",
    initialCapital: "100000",
  }).returning();
  return newUser;
}

router.get("/login", async (req: Request, res: Response) => {
  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/callback`;
    const returnTo = safeReturnTo(req.query.returnTo);

    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    const redirectTo = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: "openid email profile offline_access",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "login consent",
      state,
      nonce,
    });

    setOidcCookie(res, "code_verifier", codeVerifier);
    setOidcCookie(res, "nonce", nonce);
    setOidcCookie(res, "state", state);
    setOidcCookie(res, "return_to", returnTo);
    res.redirect(redirectTo.href);
  } catch {
    res.redirect("/");
  }
});

router.get("/callback", async (req: Request, res: Response) => {
  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/callback`;

    const codeVerifier = req.cookies?.code_verifier;
    const nonce = req.cookies?.nonce;
    const expectedState = req.cookies?.state;

    if (!codeVerifier || !expectedState) { res.redirect("/api/login"); return; }

    const currentUrl = new URL(
      `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
    );

    let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
      tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedNonce: nonce,
        expectedState,
        idTokenExpected: true,
      });
    } catch {
      res.redirect("/api/login");
      return;
    }

    res.clearCookie("code_verifier", { path: "/" });
    res.clearCookie("nonce", { path: "/" });
    res.clearCookie("state", { path: "/" });
    res.clearCookie("return_to", { path: "/" });

    const claims = tokens.claims();
    if (!claims) { res.redirect("/api/login"); return; }

    const returnTo = safeReturnTo(req.cookies?.return_to);
    const user = await upsertReplitUser(claims as unknown as Record<string, unknown>);
    const sid = await createSession({ userId: user.id });
    setSessionCookie(res, sid);
    res.redirect(returnTo);
  } catch {
    res.redirect("/api/login");
  }
});

router.get("/logout", async (req: Request, res: Response) => {
  try {
    const config = await getOidcConfig();
    const origin = getOrigin(req);
    const sid = getSessionId(req);
    await clearSession(res, sid);

    const endSessionUrl = oidc.buildEndSessionUrl(config, {
      client_id: process.env.REPL_ID!,
      post_logout_redirect_uri: origin,
    });
    res.redirect(endSessionUrl.href);
  } catch {
    res.clearCookie("sid", { path: "/" });
    res.redirect("/");
  }
});

SESSION_TTL; // keep import alive
export { router as replitAuthRouter };
