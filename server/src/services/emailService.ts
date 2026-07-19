import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import AppError from "../utils/AppError.js";

// ─── Email service (Brevo SMTP relay via nodemailer) ──
//
// Sends through Brevo's SMTP relay (smtp-relay.brevo.com). nodemailer is just the
// SMTP client that speaks the protocol to Brevo — it's not a separate provider.
// When SMTP_USER/SMTP_PASS aren't set (local dev), it logs the message instead so
// the verification flow is fully exercisable without a provider account.
//
// NOTE: BREVO_SMTP_USER is the Brevo SMTP login (…@smtp-brevo.com) and
// BREVO_SMTP_KEY is a Brevo "SMTP key" (dashboard → SMTP & API → SMTP), NOT your
// account password. EMAIL_FROM must be a sender verified in your Brevo account.

const isEmailConfigured = Boolean(env.smtpUser && env.smtpPass);

// One pooled transporter, created lazily on first send.
let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      // Port 465 uses implicit TLS; 587 (Brevo's default) upgrades via STARTTLS.
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
  }
  return transporter;
}

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendEmail({ to, subject, html, text }: EmailMessage): Promise<void> {
  if (!isEmailConfigured) {
    // NEVER log a code in production — the message body contains verification /
    // reset codes. In prod, unset SMTP creds are a hard misconfig, not a fallback.
    // (validateEnv makes BREVO_SMTP_USER/BREVO_SMTP_KEY prod-required — defense-in-depth.)
    if (env.isProduction) {
      logger.error("SMTP credentials are not set — refusing to send email.");
      throw new AppError("Email service is not configured.", 500);
    }
    // Dev fallback: surface the content (incl. any code) in the logs so the
    // verification flow is fully testable without a provider account.
    logger.warn(`[email:dev] To ${to} | ${subject}\n${text}`);
    return;
  }

  try {
    await getTransporter().sendMail({
      from: { name: env.emailFromName, address: env.emailFrom },
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    logger.error(`SMTP send failed: ${error instanceof Error ? error.message : String(error)}`);
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
