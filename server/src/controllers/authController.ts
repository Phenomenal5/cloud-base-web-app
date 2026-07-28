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

const BLOCKED_MESSAGE = "Your account has been blocked. Please contact support.";

// ─── Helpers ──────────────────────────────────────────

// Tokens are also returned in the body so non-browser clients (mobile, desktop)
// can hold them; web clients ignore the body and use the cookies.
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

// Consuming the previous codes first means only the newest one ever works.
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

// Cookie for web clients, body for everyone else.
function extractRefreshToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[COOKIE_NAMES.REFRESH];
  if (fromCookie) return fromCookie;
  const fromBody = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  return typeof fromBody === "string" ? fromBody : undefined;
}

// ─── POST /api/auth/register ──────────────────────────
// Creates the account unverified and emails a code. No session yet: verifying
// that code is what logs the user in.
export const register = catchAsync(async (req, res) => {
  const { email, password, displayName } = req.body as {
    email: string;
    password: string;
    displayName: string;
  };

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.emailVerified) {
      throw new AppError("An account with that email already exists. Please log in.", 409);
    }
    if (existing.status === "BLOCKED") throw new AppError(BLOCKED_MESSAGE, 403);

    // Signed up before but never verified, so the account is unclaimed. Reset it
    // to what they just typed and resend, which lets the frontend route them
    // straight to the verification page. Safe because activating it still needs
    // the code emailed to this address.
    const passwordHash = await hashPassword(password);
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, displayName },
    });
    await issueVerificationCode(updated.id, updated.email);

    res.status(200).json({
      message:
        "You already started signing up with this email. We've sent a new verification code.",
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
export const verifyEmail = catchAsync(async (req, res) => {
  const { email, code } = req.body as { email: string; code: string };

  const user = await prisma.user.findUnique({ where: { email } });
  // Same message whether the account exists or the code is wrong, so this can't
  // be used to enumerate registered emails.
  if (!user) throw new AppError("Invalid or expired verification code.", 400);
  if (user.emailVerified) throw new AppError("Email already verified. Please log in.", 409);
  if (user.status === "BLOCKED") throw new AppError(BLOCKED_MESSAGE, 403);

  const token = await prisma.emailVerificationToken.findFirst({
    where: {
      userId: user.id,
      codeHash: hashToken(code),
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!token) throw new AppError("Invalid or expired verification code.", 400);

  // Verify and consume together, so a code can't be replayed if the second write
  // fails.
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
// Always the same response, so it can't be used to enumerate emails.
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

  // One message for unknown email, OAuth-only account, and wrong password alike.
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError("Invalid email or password.", 401);
  }

  if (user.status === "BLOCKED") throw new AppError(BLOCKED_MESSAGE, 403);
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

  // Someone blocked mid-session loses it here, at their next refresh.
  if (record.user.status === "BLOCKED") {
    await prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    clearAuthCookies(res);
    throw new AppError(BLOCKED_MESSAGE, 403);
  }

  // Rotate in one transaction, so a stolen token can't outlive its first
  // legitimate use.
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
    // updateMany rather than update, so an unknown token is a no-op instead of a
    // 404 that would tell the caller whether the token was real.
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
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new AppError("User not found.", 404);
  res.status(200).json({ data: { user: toPublicUser(user) } });
});

// ─── GET /api/auth/google/callback ────────────────────
// Runs after passport's strategy has resolved req.user. We mint our own cookie
// session and hand the browser back to the frontend.
export const googleCallback = catchAsync(async (req, res) => {
  const user = req.user as unknown as { id: string; role: Role; status: UserStatus } | undefined;

  if (!user) return res.redirect(env.oauthFailureRedirect);

  if (user.status === "BLOCKED") {
    // Built through URL so this works whether or not the configured failure
    // redirect already carries a query string.
    const failure = new URL(env.oauthFailureRedirect);
    failure.searchParams.set("reason", "blocked");
    return res.redirect(failure.toString());
  }

  await issueSession(res, { id: user.id, role: user.role });
  res.redirect(env.oauthSuccessRedirect);
});

// ─── POST /api/auth/forgot-password ───────────────────
// Always the same response, so it can't be used to enumerate emails.
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
    // A reset signs the user out everywhere, which is the point of it if the
    // account was compromised.
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  res.status(200).json({ message: "Password reset. Please log in with your new password." });
});
