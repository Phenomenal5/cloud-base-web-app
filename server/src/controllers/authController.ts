import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiry,
  generateVerificationCode,
  verificationCodeExpiry,
  passwordResetExpiry,
} from "../utils/tokens.js";
import { setAuthCookies, clearAuthCookies, COOKIE_NAMES } from "../utils/cookies.js";
import { sendVerificationCode, sendPasswordResetCode } from "../services/emailService.js";
import { toPublicUser } from "../utils/serializeUser.js";
import type { Role, UserStatus } from "../generated/prisma/enums.js";

// ─── Helpers ──────────────────────────────────────────

// Create a refresh-token record + set auth cookies, and return the raw tokens.
// Tokens are ALSO returned in the response body so non-browser clients
// (mobile/desktop) can hold them; web clients ignore the body and use cookies.
async function issueSession(
  res: Response,
  user: { id: string; role: Role },
): Promise<{ accessToken: string; refreshToken: string }> {
  const refresh = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { tokenHash: refresh.hash, userId: user.id, expiresAt: refreshTokenExpiry() },
  });
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  setAuthCookies(res, { accessToken, refreshToken: refresh.raw });
  return { accessToken, refreshToken: refresh.raw };
}

// Issue a fresh 6-digit code: invalidate any prior unconsumed codes (only the
// newest is valid), persist the new one's hash, and email it. Used by register
// and resend.
async function issueVerificationCode(userId: string, email: string): Promise<void> {
  const { code, hash } = generateVerificationCode();
  await prisma.emailVerificationToken.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.emailVerificationToken.create({
    data: { codeHash: hash, userId, expiresAt: verificationCodeExpiry() },
  });
  await sendVerificationCode(email, code);
}

// Refresh token can arrive via the httpOnly cookie (web) or the request body
// (mobile/desktop clients that don't use cookies).
function extractRefreshToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[COOKIE_NAMES.REFRESH];
  if (fromCookie) return fromCookie;
  const fromBody = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  return typeof fromBody === "string" ? fromBody : undefined;
}

// ─── POST /api/auth/register ──────────────────────────
// Creates the account (unverified) and emails a code. No session is issued —
// the user "logs in" by verifying that code (see verifyEmail).
export const register = catchAsync(async (req, res) => {
  const { email, password, displayName } = req.body as {
    email: string;
    password: string;
    displayName: string;
  };

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Already verified → a real duplicate. Send them to login, don't resend.
    if (existing.emailVerified) {
      throw new AppError("An account with that email already exists. Please log in.", 409);
    }
    if (existing.status === "BLOCKED") {
      throw new AppError("Your account has been blocked. Please contact support.", 403);
    }
    // Signed up before but never verified → the account is unclaimed. Refresh its
    // credentials to what they just entered and resend a code, so the frontend can
    // route them straight to the verification page. Safe: activation still needs
    // the code emailed to this address, so this can't hijack a pending signup.
    const passwordHash = await hashPassword(password);
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, displayName },
    });
    await issueVerificationCode(updated.id, updated.email);

    res.status(200).json({
      message: "You already started signing up with this email. We've sent a new verification code.",
      data: { user: toPublicUser(updated), needsVerification: true },
    });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash, displayName } });

  await issueVerificationCode(user.id, user.email);

  res.status(201).json({
    message: "Account created. Check your email for a verification code.",
    data: { user: toPublicUser(user), needsVerification: true },
  });
});

// ─── POST /api/auth/verify-email ──────────────────────
// Validates the emailed code, marks the account verified, and issues the
// session — this is what logs the user in after registration.
export const verifyEmail = catchAsync(async (req, res) => {
  const { email, code } = req.body as { email: string; code: string };

  const user = await prisma.user.findUnique({ where: { email } });
  // Generic message — don't reveal whether the email exists.
  if (!user) throw new AppError("Invalid or expired verification code.", 400);
  if (user.emailVerified) throw new AppError("Email already verified. Please log in.", 409);
  if (user.status === "BLOCKED") {
    throw new AppError("Your account has been blocked. Please contact support.", 403);
  }

  const token = await prisma.emailVerificationToken.findFirst({
    where: {
      userId: user.id,
      codeHash: hashToken(code),
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!token) throw new AppError("Invalid or expired verification code.", 400);

  // Mark verified + consume the code atomically before issuing the session.
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
    prisma.emailVerificationToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    }),
  ]);

  const tokens = await issueSession(res, user);
  res.status(200).json({
    message: "Email verified",
    data: { user: toPublicUser({ ...user, emailVerified: true }), tokens },
  });
});

// ─── POST /api/auth/resend-verification ───────────────
// Always responds the same way, whether or not a matching unverified account
// exists, to avoid leaking which emails are registered.
export const resendVerification = catchAsync(async (req, res) => {
  const { email } = req.body as { email: string };

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerified && user.status !== "BLOCKED") {
    await issueVerificationCode(user.id, user.email);
  }

  res.status(200).json({
    message: "If an unverified account exists for that email, a new code has been sent.",
  });
});

// ─── POST /api/auth/login ─────────────────────────────
export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await prisma.user.findUnique({ where: { email } });

  // Same generic message whether the email is unknown, the account is OAuth-only,
  // or the password is wrong — don't reveal which emails are registered.
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError("Invalid email or password.", 401);
  }

  if (user.status === "BLOCKED") {
    throw new AppError("Your account has been blocked. Please contact support.", 403);
  }
  if (!user.emailVerified) {
    throw new AppError("Please verify your email before logging in.", 403);
  }

  const tokens = await issueSession(res, user);
  res.status(200).json({ message: "Logged in", data: { user: toPublicUser(user), tokens } });
});

// ─── POST /api/auth/refresh ───────────────────────────
export const refresh = catchAsync(async (req, res) => {
  const raw = extractRefreshToken(req);
  if (!raw) throw new AppError("Not authenticated. Please log in.", 401);

  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AppError("Session expired. Please log in again.", 401);
  }

  // A user blocked mid-session loses it at the next refresh.
  if (record.user.status === "BLOCKED") {
    await prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    clearAuthCookies(res);
    throw new AppError("Your account has been blocked. Please contact support.", 403);
  }

  // Rotate: revoke the used token and issue a fresh one in one transaction, so a
  // stolen-and-replayed refresh token can't outlive its first legitimate use.
  const next = generateRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({
      data: { tokenHash: next.hash, userId: record.userId, expiresAt: refreshTokenExpiry() },
    }),
  ]);

  const accessToken = signAccessToken({ sub: record.userId, role: record.user.role });
  setAuthCookies(res, { accessToken, refreshToken: next.raw });
  res.status(200).json({
    message: "Session refreshed",
    data: { user: toPublicUser(record.user), tokens: { accessToken, refreshToken: next.raw } },
  });
});

// ─── POST /api/auth/logout ────────────────────────────
export const logout = catchAsync(async (req, res) => {
  const raw = extractRefreshToken(req);
  if (raw) {
    // Revoke the presented token (no-op if unknown).
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  clearAuthCookies(res);
  res.status(200).json({ message: "Logged out" });
});

// ─── GET /api/auth/me ─────────────────────────────────
export const me = catchAsync(async (req, res) => {
  // `protect` guarantees req.user is set.
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new AppError("User not found.", 404);
  res.status(200).json({ data: { user: toPublicUser(user) } });
});

// ─── GET /api/auth/google/callback ────────────────────
// Runs after passport's Google strategy. passport set req.user to the resolved
// user; we mint our own JWT cookie session and redirect back to the frontend.
export const googleCallback = catchAsync(async (req, res) => {
  const user = req.user as unknown as
    | { id: string; role: Role; status: UserStatus }
    | undefined;

  if (!user) {
    res.redirect(env.oauthFailureRedirect);
    return;
  }
  if (user.status === "BLOCKED") {
    res.redirect(`${env.oauthFailureRedirect}&reason=blocked`);
    return;
  }

  await issueSession(res, { id: user.id, role: user.role });
  res.redirect(env.oauthSuccessRedirect);
});

// Issue a fresh reset code: invalidate prior unconsumed codes, persist the new
// hash, and email it.
async function issuePasswordResetCode(userId: string, email: string): Promise<void> {
  const { code, hash } = generateVerificationCode();
  await prisma.passwordResetToken.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.passwordResetToken.create({
    data: { codeHash: hash, userId, expiresAt: passwordResetExpiry() },
  });
  await sendPasswordResetCode(email, code);
}

// ─── POST /api/auth/forgot-password ───────────────────
// Always responds the same way, whether or not the account exists, to avoid
// leaking which emails are registered.
export const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body as { email: string };

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.status !== "BLOCKED") {
    await issuePasswordResetCode(user.id, user.email);
  }

  res.status(200).json({
    message: "If an account exists for that email, a reset code has been sent.",
  });
});

// ─── POST /api/auth/reset-password ────────────────────
// Verifies the code, sets the new password, and revokes ALL refresh tokens so
// every existing session is logged out (FR-5).
export const resetPassword = catchAsync(async (req, res) => {
  const { email, code, newPassword } = req.body as {
    email: string;
    code: string;
    newPassword: string;
  };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError("Invalid or expired reset code.", 400);

  const token = await prisma.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      codeHash: hashToken(code),
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!token) throw new AppError("Invalid or expired reset code.", 400);

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
    // Revoke every session — a reset should log the user out everywhere.
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  res.status(200).json({ message: "Password reset. Please log in with your new password." });
});
