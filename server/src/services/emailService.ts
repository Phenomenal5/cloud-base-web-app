import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import AppError from "../utils/AppError.js";

// ─── Email service (Brevo transactional API) ──────────
//
// Sends via Brevo's REST API using native fetch — no SDK dependency. When
// BREVO_API_KEY isn't set (local dev), it logs the message instead so the
// verification flow is fully exercisable without a provider account.
//
// NOTE: Brevo authenticates with an `api-key` header (not Bearer), and the
// sender email must be a verified sender/domain in your Brevo account.

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendEmail({ to, subject, html, text }: EmailMessage): Promise<void> {
  if (!env.brevoApiKey) {
    // NEVER log a code in production — the message body contains verification /
    // reset codes. In prod a missing key is a hard misconfig, not a fallback.
    // (validateEnv makes BREVO_API_KEY prod-required, so this is defense-in-depth.)
    if (env.isProduction) {
      logger.error("BREVO_API_KEY is not set — refusing to send email.");
      throw new AppError("Email service is not configured.", 500);
    }
    // Dev fallback: surface the content (incl. any code) in the logs so the
    // verification flow is fully testable without a provider account.
    logger.warn(`[email:dev] To ${to} | ${subject}\n${text}`);
    return;
  }

  const response = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": env.brevoApiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: env.emailFromName, email: env.emailFrom },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    logger.error(`Brevo send failed (${response.status}): ${detail}`);
    // 502: our upstream (the email provider) failed, not the client.
    throw new AppError("Failed to send email. Please try again shortly.", 502);
  }
}

// ─── Verification code email ──────────────────────────
export async function sendVerificationCode(to: string, code: string): Promise<void> {
  const minutes = env.verificationCodeTtlMinutes;
  const subject = "Your AeroLens verification code";
  const text = `Your AeroLens verification code is ${code}. It expires in ${minutes} minutes. If you didn't request this, you can ignore this email.`;
  const html = codeEmailHtml(
    "Verify your email",
    "Use this code to finish setting up your AeroLens account:",
    code,
    minutes,
  );

  await sendEmail({ to, subject, html, text });
}

// ─── Password reset code email ────────────────────────
export async function sendPasswordResetCode(to: string, code: string): Promise<void> {
  const minutes = env.passwordResetTtlMinutes;
  const subject = "Your AeroLens password reset code";
  const text = `Your AeroLens password reset code is ${code}. It expires in ${minutes} minutes. If you didn't request a reset, you can safely ignore this email.`;
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
