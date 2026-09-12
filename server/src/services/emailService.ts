import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import AppError from "../utils/AppError.js";

// Brevo's HTTPS API, not their SMTP relay. Most PaaS hosts block outbound SMTP
// ports, so nodemailer to smtp-relay.brevo.com:587 just hung until timeout.
//
// BREVO_API_KEY is the v3 API key (starts `xkeysib-`), not the separate SMTP key.
// EMAIL_FROM must be a verified Brevo sender, the usual cause of a 400 here.

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
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
    // Never log the body in production, it carries verification and reset codes.
    // A missing key in prod is a misconfiguration, not a fallback.
    if (env.isProduction) {
      logger.error("BREVO_API_KEY is not set, refusing to send email.");
      throw new AppError("Email service is not configured.", 500);
    }
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
      // Otherwise a slow provider holds the registration request open.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error(`Brevo request failed: ${error instanceof Error ? error.message : String(error)}`);
    throw new AppError("Failed to send email. Please try again shortly.", 502);
  }

  if (!response.ok) {
    // Brevo returns { code, message } naming the actual problem ("sender not
    // valid", "unauthorized"), so log it verbatim.
    const detail = await response.text().catch(() => "<unreadable body>");
    logger.error(`Brevo rejected the send (HTTP ${response.status}): ${detail}`);
    throw new AppError("Failed to send email. Please try again shortly.", 502);
  }
}

// ─── Branding ─────────────────────────────────────────
//
// Mirrors the light palette in client/src/app/globals.css. Duplicated because
// the API can't reach those CSS variables and mail clients ignore var() anyway.
//
// Mail clients strip <style> and ignore class-based dark mode, so everything
// below is inline styles on nested tables. Dated, but it renders in Outlook.
const BRAND = {
  background: "#f1f5f9",
  surface: "#ffffff",
  surfaceMuted: "#f1f5f9",
  foreground: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  primary: "#1d4ed8",
  onPrimary: "#ffffff",
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

interface CodeEmailOptions {
  heading: string;
  lead: string;
  code: string;
  minutes: number;
  // Shown in the inbox preview line, next to the subject.
  preheader: string;
}

function codeEmailHtml({ heading, lead, code, minutes, preheader }: CodeEmailOptions): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:${BRAND.background};">
    <!-- Hidden, but mail clients show it as the inbox preview line. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:${BRAND.background};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:480px;background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">

            <!-- Brand bar -->
            <tr>
              <td style="background-color:${BRAND.primary};padding:20px 32px;">
                <span style="font-family:${FONT_STACK};font-size:18px;font-weight:600;color:${BRAND.onPrimary};letter-spacing:-0.2px;">
                  Nasight
                </span>
              </td>
            </tr>

            <tr>
              <td style="padding:32px;font-family:${FONT_STACK};">
                <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:${BRAND.foreground};">
                  ${heading}
                </h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${BRAND.muted};">
                  ${lead}
                </p>

                <!-- The code itself, the one thing they came for. -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center"
                        style="background-color:${BRAND.surfaceMuted};border:1px solid ${BRAND.border};border-radius:12px;padding:20px;">
                      <span style="font-family:${FONT_STACK};font-size:32px;font-weight:700;letter-spacing:10px;color:${BRAND.primary};">
                        ${code}
                      </span>
                    </td>
                  </tr>
                </table>

                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${BRAND.muted};">
                  This code expires in ${minutes} minutes and can only be used once.
                  If you didn't request it, you can safely ignore this email.
                </p>
              </td>
            </tr>

            <tr>
              <td style="border-top:1px solid ${BRAND.border};padding:16px 32px;
                         font-family:${FONT_STACK};font-size:12px;color:${BRAND.muted};">
                Nasight — aviation safety, in plain language.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendVerificationCode(to: string, code: string): Promise<void> {
  const minutes = env.verificationCodeTtlMinutes;
  await sendEmail({
    to,
    subject: "Your Nasight verification code",
    text: `Your Nasight verification code is ${code}. It expires in ${minutes} minutes. If you didn't request this, you can ignore this email.`,
    html: codeEmailHtml({
      heading: "Verify your email",
      lead: "Use this code to finish setting up your Nasight account.",
      code,
      minutes,
      preheader: `Your verification code is ${code}.`,
    }),
  });
}

export async function sendPasswordResetCode(to: string, code: string): Promise<void> {
  const minutes = env.passwordResetTtlMinutes;
  await sendEmail({
    to,
    subject: "Your Nasight password reset code",
    text: `Your Nasight password reset code is ${code}. It expires in ${minutes} minutes. If you didn't request a reset, you can safely ignore this email.`,
    html: codeEmailHtml({
      heading: "Reset your password",
      lead: "Use this code to set a new password. Resetting will sign you out everywhere.",
      code,
      minutes,
      preheader: `Your password reset code is ${code}.`,
    }),
  });
}
