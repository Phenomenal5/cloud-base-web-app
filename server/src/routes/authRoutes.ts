import { Router, type RequestHandler } from "express";
import passport from "passport";
import {
  register,
  verifyEmail,
  resendVerification,
  login,
  refresh,
  logout,
  me,
  forgotPassword,
  resetPassword,
  googleCallback,
} from "../controllers/authController.js";
import { protect } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { authLimiter } from "../middlewares/rateLimiter.js";
import { env, isGoogleOAuthEnabled } from "../config/env.js";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/authSchemas.js";

// Wiring only: rate limit, validate, controller.

const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register with email + password (emails a 6-digit verification code)
 *     description: >
 *       Creates an unverified account and emails a code — no session yet. If the email
 *       belongs to an unverified account, its credentials are refreshed and a new code
 *       is sent (200). A verified email returns 409.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, displayName]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, maxLength: 72 }
 *               displayName: { type: string, maxLength: 80 }
 *     responses:
 *       201: { description: Account created, code sent }
 *       200: { description: Existing unverified account — new code sent }
 *       409: { description: Email already registered & verified }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.post("/register", authLimiter, validate(registerSchema), register);

/**
 * @openapi
 * /auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify the emailed code and start a session (logs the user in)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string, format: email }
 *               code: { type: string, pattern: '^\d{6}$' }
 *     responses:
 *       200:
 *         description: Verified — session cookies set, tokens returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/User' }
 *                     tokens: { $ref: '#/components/schemas/TokenPair' }
 *       400: { description: Invalid or expired code }
 *       409: { description: Already verified }
 */
router.post("/verify-email", authLimiter, validate(verifyEmailSchema), verifyEmail);

/**
 * @openapi
 * /auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Resend a verification code (generic response — no account enumeration)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties: { email: { type: string, format: email } }
 *     responses:
 *       200: { description: Generic acknowledgement }
 */
router.post(
  "/resend-verification",
  authLimiter,
  validate(resendVerificationSchema),
  resendVerification,
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email + password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Logged in — cookies set, tokens returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/User' }
 *                     tokens: { $ref: '#/components/schemas/TokenPair' }
 *       401: { description: Invalid credentials }
 *       403: { description: Email not verified, or account blocked }
 */
router.post("/login", authLimiter, validate(loginSchema), login);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset code (generic response)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties: { email: { type: string, format: email } }
 *     responses:
 *       200: { description: Generic acknowledgement }
 */
router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema), forgotPassword);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password with the emailed code (revokes all sessions)
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, newPassword]
 *             properties:
 *               email: { type: string, format: email }
 *               code: { type: string, pattern: '^\d{6}$' }
 *               newPassword: { type: string, minLength: 8, maxLength: 72 }
 *     responses:
 *       200: { description: Password reset — log in again }
 *       400: { description: Invalid or expired code }
 */
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), resetPassword);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate the refresh token and issue a new access token
 *     description: Refresh token from the httpOnly cookie or a JSON body `{ refreshToken }`.
 *     security: []
 *     responses:
 *       200: { description: New session issued (rotated) }
 *       401: { description: Missing, expired, or revoked refresh token }
 *       403: { description: Account blocked }
 */
// No `protect` here: the refresh token itself is the credential.
router.post("/refresh", refresh);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke the current refresh token and clear cookies
 *     security: []
 *     responses:
 *       200: { description: Logged out }
 */
router.post("/logout", logout);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Current authenticated user
 *     responses:
 *       200:
 *         description: The signed-in user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties: { user: { $ref: '#/components/schemas/User' } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/me", protect, me);

// Answers 503 when OAuth isn't configured, so the passport middleware never runs
// without credentials and throws "Unknown strategy".
const requireGoogle: RequestHandler = (_req, res, next) => {
  if (!isGoogleOAuthEnabled) {
    res.status(503).json({ status: "fail", message: "Google login is not configured." });
    return;
  }
  next();
};

/**
 * @openapi
 * /auth/google:
 *   get:
 *     tags: [Auth]
 *     summary: Begin Google OAuth (redirects to Google)
 *     security: []
 *     responses:
 *       302: { description: Redirect to Google consent }
 *       503: { description: Google OAuth not configured }
 */
router.get(
  "/google",
  requireGoogle,
  passport.authenticate("google", { scope: ["profile", "email"], session: false }),
);

/**
 * @openapi
 * /auth/google/callback:
 *   get:
 *     tags: [Auth]
 *     summary: Google OAuth callback — issues a session, redirects to the frontend
 *     security: []
 *     responses:
 *       302: { description: Redirect to the frontend (success or failure URL) }
 */
router.get(
  "/google/callback",
  requireGoogle,
  passport.authenticate("google", { session: false, failureRedirect: env.oauthFailureRedirect }),
  googleCallback,
);

export default router;
