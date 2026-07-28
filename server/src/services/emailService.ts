import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import AppError from "../utils/AppError.js";

// ─── Email service (Brevo transactional email API) ────
//
// Sends over Brevo's HTTPS API rather than their SMTP relay.
//
// NOTE: this used to go through nodemailer → smtp-relay.brevo.com:587. Most PaaS
// hosts (Railway, Render, Fly, Heroku) block outbound SMTP ports to fight spam,
// so those sends just hang until they time out. HTTPS on 443 is never blocked,
// which is why the API is the right transport for a deployed app.
//
// NOTE: BREVO_API_KEY is the v3 API key (dashboard → SMTP & API → API Keys), the
// one starting `xkeysib-`. It is NOT the "SMTP key" the old transport used —
// they're issued separately and are not interchangeable.
//
// EMAIL_FROM must be a sender you've verified in Brevo. An unverified sender is
// the most common cause of a 400 back from this endpoint.

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
// Don't let a slow provider hold a registration request open indefinitely.
const REQUEST_TIMEOUT_MS = 10_000;

const isEmailConfigured = Boolean(env.brevoApiKey);

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendEmail({ to, subject, html, text }: EmailMessage): Promise<void> {
  if (!isEmailConfigured) {
    // NEVER log a code in production — the message body contains verification /
    // reset codes. In prod, a missing key is a hard misconfig, not a fallback.
    // (validateEnv makes BREVO_API_KEY prod-required — defense in depth.)
    if (env.isProduction) {
      logger.error("BREVO_API_KEY is not set — refusing to send email.");
      throw new AppError("Email service is not configured.", 500);
    }
    // Dev fallback: surface the content (incl. any code) in the logs so the
    // verification flow is fully testable without a provider account.
    logger.warn(`[email:dev] To ${to} | ${subject}\n${text}`);
    return;
  }

  let response: Response;
  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": env.brevoApiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: env.emailFromName, email: env.emailFrom },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Network failure or the timeout above firing.
    logger.error(`Brevo request failed: ${error instanceof Error ? error.message : String(error)}`);
    throw new AppError("Failed to send email. Please try again shortly.", 502);
  }

  if (!response.ok) {
    // Brevo returns { code, message } on failure — log it verbatim. It names the
    // actual problem ("sender not valid", "unauthorized"), which is the whole
    // difference between a five-minute fix and an afternoon of guessing.
    const detail = await response.text().catch(() => "<unreadable body>");
    logger.error(`Brevo rejected the send (HTTP ${response.status}): ${detail}`);
    throw new AppError("Failed to send email. Please try again shortly.", 502);
  }
}

// ─── Verification code email ──────────────────────────
export async function sendVerificationCode(to: string, code: string): Promise<void> {
  const minutes = env.verificationCodeTtlMinutes;
  const subject = "Your Nasight verification code";
  const text = `Your Nasight verification code is ${code}. It expires in ${minutes} minutes. If you didn't request this, you can ignore this email.`;
  const html = codeEmailHtml(
    "Verify your email",
    "Use this code to finish setting up your Nasight account:",
    code,
    minutes,
  );

  await sendEmail({ to, subject, html, text });
}

// ─── Password reset code email ────────────────────────
export async function sendPasswordResetCode(to: string, code: string): Promise<void> {
  const minutes = env.passwordResetTtlMinutes;
  const subject = "Your Nasight password reset code";
  const text = `Your Nasight password reset code is ${code}. It expires in ${minutes} minutes. If you didn't request a reset, you can safely ignore this email.`;
  const html = codeEmailHtml(
    "Reset your password",
    "Use this code to set a new password:",
    code,
    minutes,
  );

  await sendEmail({ to, subject, html, text });
}

function codeEmailHtml(heading: string, lead: string, code: string, minutes: number): string {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: auto;">
      <h2>${heading}</h2>
      <p>${lead}</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${code}</p>
      <p style="color: #666;">This code expires in ${minutes} minutes. If you didn't request it, you can ignore this email.</p>
    </div>`;
}
