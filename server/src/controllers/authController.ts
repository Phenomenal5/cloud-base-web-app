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

// =========== Helpers ==============

// start a logged-in session
const issueSession = async (
  res: Response,
  user: { id: string; role: Role },
): Promise<{ accessToken: string; refreshToken: string }> => {
  // new refresh token, store the hash not the token itself
  const refresh = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { tokenHash: refresh.hash, userId: user.id, expiresAt: refreshTokenExpiry() },
  });

  // short-lived access token to go with it
  const accessToken = signAccessToken({ sub: user.id, role: user.role });

  // cookies for the browser
  setAuthCookies(res, { accessToken, refreshToken: refresh.raw });

  // also hand them back so mobile/desktop clients can keep them themselves
  return { accessToken, refreshToken: refresh.raw };
};

// email a fresh verification code
const issueVerificationCode = async (userId: string, email: string): Promise<void> => {
  const { code, hash } = generateVerificationCode();

  // burn any codes they already have so only the newest one works
  await prisma.emailVerificationToken.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.emailVerificationToken.create({
    data: { codeHash: hash, userId, expiresAt: verificationCodeExpiry() },
  });

  // then send it
  await sendVerificationCode(email, code);
};

// same idea, but for password resets
const issuePasswordResetCode = async (userId: string, email: string): Promise<void> => {
  const { code, hash } = generateVerificationCode();

  await prisma.passwordResetToken.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.passwordResetToken.create({
    data: { codeHash: hash, userId, expiresAt: passwordResetExpiry() },
  });

  await sendPasswordResetCode(email, code);
};

// grab the refresh token: cookie for web, body for everyone else
const extractRefreshToken = (req: Request): string | undefined => {
  const fromCookie = req.cookies?.[COOKIE_NAMES.REFRESH];
  if (fromCookie) return fromCookie;
  const fromBody = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  return typeof fromBody === "string" ? fromBody : undefined;
};

// ========== sign up controller ======================
export const register = catchAsync(async (req, res) => {
  const { email, password, displayName } = req.body as {
    email: string;
    password: string;
    displayName: string;
  };

  // does the user exist already? if so, either send them to login or overwrite the unverified account
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // finished signing up already, so send them to login
    if (existing.emailVerified) {
      throw new AppError("An account with that email already exists. Please log in.", 409);
    }
    if (existing.status === "BLOCKED") throw new AppError(BLOCKED_MESSAGE, 403);

    // started before but email never verified, so nobody owns this account yet.
    // overwrite it with whatever they just typed
    const passwordHash = await hashPassword(password);
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, displayName },
    });

    // new code out, and the frontend can drop them straight on the verify page
    await issueVerificationCode(updated.id, updated.email);

    res.status(200).json({
      message:
        "You already started signing up with this email. We've sent a new verification code.",
      data: { user: toPublicUser(updated), needsVerification: true },
    });
    return;
  }

  // brand new account. no session yet, entering the code is what logs them in
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash, displayName } });

  // then email them the code
  await issueVerificationCode(user.id, user.email);

  res.status(201).json({
    message: "Account created. Check your email for a verification code.",
    data: { user: toPublicUser(user), needsVerification: true },
  });
});

// ========= verify email controller ============
export const verifyEmail = catchAsync(async (req, res) => {
  const { email, code } = req.body as { email: string; code: string };

  const user = await prisma.user.findUnique({ where: { email } });

  // keep the same message for "no such user" and "wrong code", otherwise this
  // turns into a way to find out which emails are registered
  if (!user) throw new AppError("Invalid or expired verification code.", 400);
  if (user.emailVerified) throw new AppError("Email already verified. Please log in.", 409);
  if (user.status === "BLOCKED") throw new AppError(BLOCKED_MESSAGE, 403);

  // find a code that matches, is unused, and hasn't expired
  const token = await prisma.emailVerificationToken.findFirst({
    where: {
      userId: user.id,
      codeHash: hashToken(code),
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!token) throw new AppError("Invalid or expired verification code.", 400);

  // flip the user and burn the code together. if the second write fails on its
  // own the code stays usable, which is a replay
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
    prisma.emailVerificationToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    }),
  ]);

  // verified, so log them straight in
  const tokens = await issueSession(res, user);
  res.status(200).json({
    message: "Email verified",
    data: { user: toPublicUser({ ...user, emailVerified: true }), tokens },
  });
});

// ========= resend verification code controller ==========
export const resendVerification = catchAsync(async (req, res) => {
  const { email } = req.body as { email: string };

  // only actually resend if there's an unverified account to resend for
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerified && user.status !== "BLOCKED") {
    await issueVerificationCode(user.id, user.email);
  }

  // but always reply the same way, so this can't be used to fish for emails
  res.status(200).json({
    message: "If an unverified account exists for that email, a new code has been sent.",
  });
});

// ========== login controller ==================
export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  // pull the user, then check the password against the stored hash
  const user = await prisma.user.findUnique({ where: { email } });

  // unknown email, google-only account, and wrong password all fail the same way
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError("Invalid email or password.", 401);
  }

  // password was right, now check they're actually allowed in
  if (user.status === "BLOCKED") throw new AppError(BLOCKED_MESSAGE, 403);
  if (!user.emailVerified) {
    throw new AppError("Please verify your email before logging in.", 403);
  }

  const tokens = await issueSession(res, user);
  res.status(200).json({ message: "Logged in", data: { user: toPublicUser(user), tokens } });
});

// ========= refresh session controller ===============
export const refresh = catchAsync(async (req, res) => {
  const raw = extractRefreshToken(req);
  if (!raw) throw new AppError("Not authenticated. Please log in.", 401);

  // look the token up by its hash, that's all we stored
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: true },
  });

  // revoked or past its expiry means the session is done
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AppError("Session expired. Please log in again.", 401);
  }

  // blocked someone mid-session? this is where they lose it, since the access
  // token itself is never checked against the db
  if (record.user.status === "BLOCKED") {
    await prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    clearAuthCookies(res);
    throw new AppError(BLOCKED_MESSAGE, 403);
  }

  // rotate: kill the old one and mint the new one in the same transaction, so a
  // stolen token stops working the moment the real user refreshes
  const next = generateRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({
      data: { tokenHash: next.hash, userId: record.userId, expiresAt: refreshTokenExpiry() },
    }),
  ]);

  // fresh access token to go with the rotated refresh token
  const accessToken = signAccessToken({ sub: record.userId, role: record.user.role });
  setAuthCookies(res, { accessToken, refreshToken: next.raw });
  res.status(200).json({
    message: "Session refreshed",
    data: { user: toPublicUser(record.user), tokens: { accessToken, refreshToken: next.raw } },
  });
});

// ========== logout controller ============
export const logout = catchAsync(async (req, res) => {
  const raw = extractRefreshToken(req);
  if (raw) {
    // updateMany so an unknown token just does nothing. update() would 404 and
    // tell the caller whether the token was real
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // clear the cookies either way
  clearAuthCookies(res);
  res.status(200).json({ message: "Logged out" });
});

// ========= logged in user controller ==============
export const me = catchAsync(async (req, res) => {
  // protect already put the id on req, so just read them back out
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

  // deleted since the token was issued
  if (!user) throw new AppError("User not found.", 404);
  res.status(200).json({ data: { user: toPublicUser(user) } });
});

// ========== google login callback controller ==================
export const googleCallback = catchAsync(async (req, res) => {
  // passport has already done the code exchange and put the user on req
  const user = req.user as unknown as { id: string; role: Role; status: UserStatus } | undefined;

  if (!user) return res.redirect(env.oauthFailureRedirect);

  if (user.status === "BLOCKED") {
    // build it through URL so it still works if the configured redirect already
    // has a query string on it
    const failure = new URL(env.oauthFailureRedirect);
    failure.searchParams.set("reason", "blocked");
    return res.redirect(failure.toString());
  }

  // give them the same cookie session a normal login would get, then hand the
  // browser back to the frontend
  await issueSession(res, { id: user.id, role: user.role });
  res.redirect(env.oauthSuccessRedirect);
});

// ========= forgot password controller ===============
export const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body as { email: string };

  // only send if there's something to send to
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.status !== "BLOCKED") {
    await issuePasswordResetCode(user.id, user.email);
  }

  // same reply either way, again so nobody can fish for registered emails
  res.status(200).json({
    message: "If an account exists for that email, a reset code has been sent.",
  });
});

// ========== reset password controller ==============
export const resetPassword = catchAsync(async (req, res) => {
  const { email, code, newPassword } = req.body as {
    email: string;
    code: string;
    newPassword: string;
  };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError("Invalid or expired reset code.", 400);

  // same check as verify-email: matching, unused, unexpired
  const token = await prisma.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      codeHash: hashToken(code),
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!token) throw new AppError("Invalid or expired reset code.", 400);

  // swap the password, burn the code, and kill every session in one go
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
    // and sign them out everywhere. if the account was compromised, that's the
    // whole point of resetting
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  res.status(200).json({ message: "Password reset. Please log in with your new password." });
});
