import nodemailer from "nodemailer";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface SendOtpResult {
  success: boolean;
  message: string;
  mode: "brevo" | "smtp" | "fallback";
}

let cachedTransporter: nodemailer.Transporter | null = null;
let lastConfigHash = "";

async function getEmailConfig() {
  // Check env vars first
  let brevoApiKey = process.env.BREVO_API_KEY || "";
  let brevoSenderEmail = process.env.BREVO_SENDER_EMAIL || process.env.BREVO_SENDER || "";

  let user = process.env.SMTP_USER || process.env.GMAIL_USER || "";
  let pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASSWORD || "";
  let host = process.env.SMTP_HOST || "";
  let port = parseInt(process.env.SMTP_PORT || "0", 10);
  let secure = process.env.SMTP_SECURE === "true";
  let from = process.env.SMTP_FROM || "";

  // Query system_settings table for dynamic configuration (including user-provided Brevo keys)
  try {
    const rows = await db.select().from(systemSettingsTable);
    for (const row of rows) {
      if (row.key === "brevo_api_key" && !brevoApiKey) brevoApiKey = row.value.trim();
      if (row.key === "brevo_sender_email" && !brevoSenderEmail) brevoSenderEmail = row.value.trim();
      if (row.key === "smtp_user" && !user) user = row.value.trim();
      if (row.key === "smtp_pass" && !pass) pass = row.value.trim();
      if (row.key === "smtp_host" && !host) host = row.value.trim();
      if (row.key === "smtp_port" && !port) port = parseInt(row.value, 10);
      if (row.key === "smtp_from" && !from) from = row.value.trim();
    }
  } catch {
    // Ignore DB read failure if table isn't accessible
  }

  // If host not specified but user is a gmail address or GMAIL_USER is used, default to Gmail SMTP
  if (!host && (user.includes("@gmail.com") || process.env.GMAIL_USER)) {
    host = "smtp.gmail.com";
    port = 465;
    secure = true;
  }

  if (!host) host = "smtp.gmail.com";
  if (!port) port = host === "smtp.gmail.com" ? 465 : 587;
  if (!from) from = user ? `PaperTrade Pro <${user}>` : `PaperTrade Pro <no-reply@papertradepro.com>`;
  if (!brevoSenderEmail) brevoSenderEmail = user || "singireddipavan29@gmail.com";

  return { brevoApiKey, brevoSenderEmail, host, port, secure: secure || port === 465, user, pass, from };
}

export function buildOtpEmailHtml(otp: string, purpose: "register" | "login" = "register"): string {
  const isLogin = purpose === "login";
  const title = isLogin ? "Login Verification Code" : "Verify Your Gmail Address";
  const subtitle = isLogin
    ? "Use the one-time password below to authenticate and enter your PaperTrade Pro trading cockpit."
    : "Thank you for joining PaperTrade Pro. Use the one-time verification code below to complete your registration:";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PaperTrade Pro Verification Code</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #0b1120; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);">
    <!-- Header -->
    <tr>
      <td style="padding: 32px 32px 20px 32px; text-align: center; border-bottom: 1px solid #1e293b;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #10b981;">
          PaperTrade<span style="color: #f8fafc;">Pro</span>
        </h1>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">
          Institutional Options Simulator & AI Behavioral Mentor
        </p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding: 36px 32px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #f8fafc; text-align: center;">
          ${title}
        </h2>
        <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 22px; color: #cbd5e1; text-align: center;">
          ${subtitle}
        </p>

        <!-- OTP Highlight Box -->
        <div style="background: linear-gradient(180deg, #102a45 0%, #0c1a2e 100%); border: 2px solid #2563eb; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #60a5fa; font-weight: 700; margin-bottom: 6px;">
            Your One-Time Password (OTP)
          </div>
          <div style="font-family: 'Courier New', Courier, monospace; font-size: 42px; font-weight: 900; letter-spacing: 10px; color: #38bdf8; text-shadow: 0 0 12px rgba(56, 189, 248, 0.4);">
            ${otp}
          </div>
          <div style="font-size: 12px; color: #94a3b8; margin-top: 8px;">
            Valid for <strong>10 minutes</strong>
          </div>
        </div>

        <p style="margin: 20px 0 0 0; font-size: 12px; line-height: 18px; color: #64748b; text-align: center;">
          If you did not request this verification code, please ignore this email. Never share your OTP with anyone.
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 20px 32px; background-color: #070d19; border-top: 1px solid #1e293b; text-align: center;">
        <p style="margin: 0; font-size: 11px; color: #475569;">
          © 2026 PaperTrade Pro. All rights reserved. Real-Time Options Simulation Engine.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

export async function sendEmailOtp(
  toEmail: string,
  otp: string,
  purpose: "register" | "login" = "register"
): Promise<SendOtpResult> {
  const cleanEmail = toEmail.trim().toLowerCase();
  const config = await getEmailConfig();
  const subject = purpose === "login" 
    ? `Your PaperTrade Pro Login OTP: ${otp}` 
    : `Your PaperTrade Pro Verification Code: ${otp}`;
  const html = buildOtpEmailHtml(otp, purpose);
  const text = `PaperTrade Pro Verification\n\nYour 6-digit OTP code is: ${otp}\n\nThis code will expire in 10 minutes.`;

  // PRIORITY 1: Brevo REST API v3
  if (config.brevoApiKey) {
    try {
      console.log(`[AUTH] Attempting to send real-time OTP to ${cleanEmail} via Brevo API...`);
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": config.brevoApiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: "PaperTrade Pro",
            email: config.brevoSenderEmail,
          },
          to: [{ email: cleanEmail }],
          subject,
          htmlContent: html,
          textContent: text,
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        console.log(`[AUTH] Successfully dispatched Brevo email to ${cleanEmail}:`, data);
        return {
          success: true,
          message: `Verification code sent to your Gmail (${cleanEmail}) via Brevo`,
          mode: "brevo",
        };
      } else {
        const errText = await res.text();
        console.warn(`[AUTH] Brevo API responded with ${res.status}:`, errText);
        try {
          const parsed = JSON.parse(errText);
          if (parsed?.message && (parsed.message.includes("authorised_ips") || parsed.message.includes("unrecognised IP"))) {
            console.warn("[AUTH] Brevo security blocked request due to IP whitelist. Please turn off IP restriction in your Brevo settings.");
          }
        } catch {}
      }
    } catch (err: any) {
      console.error(`[AUTH] Failed to send via Brevo API:`, err?.message || err);
    }
  }

  // PRIORITY 2: Nodemailer SMTP (Gmail / Custom SMTP)
  if (config.user && config.pass) {
    try {
      const configHash = `${config.host}:${config.port}:${config.user}:${config.pass}`;
      if (!cachedTransporter || lastConfigHash !== configHash) {
        cachedTransporter = nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: {
            user: config.user,
            pass: config.pass,
          },
          tls: {
            rejectUnauthorized: false,
          },
        });
        lastConfigHash = configHash;
      }

      await cachedTransporter.sendMail({
        from: config.from,
        to: cleanEmail,
        subject,
        text,
        html,
      });

      console.log(`[AUTH] Sent real email OTP to ${cleanEmail} via SMTP`);
      return {
        success: true,
        message: `Verification code sent to ${cleanEmail}`,
        mode: "smtp",
      };
    } catch (err: any) {
      console.error(`[AUTH] Failed to send email via SMTP to ${cleanEmail}:`, err?.message || err);
    }
  }

  // PRIORITY 3: Fallback (Console logging / Demo code)
  console.log(`[AUTH OTP] Verification code for ${cleanEmail} (${purpose}): ${otp} (Brevo/SMTP not configured or failed)`);
  return {
    success: true,
    message: `Verification code generated for ${cleanEmail}`,
    mode: "fallback",
  };
}
