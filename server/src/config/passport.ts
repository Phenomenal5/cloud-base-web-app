import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { prisma } from "./prisma.js";
import { env, isGoogleOAuthEnabled } from "./env.js";
import { logger } from "./logger.js";

// ─── Passport (Google OAuth, stateless) ───────────────
//
// Passport only handles the OAuth authorization-code exchange. We don't use
// passport sessions (session: false) — the callback controller mints our own JWT
// cookie session, keeping auth uniform with credential login.
//
// NOTE: this is the standard confidential-client code flow (client secret secures
// the exchange). PKCE + state (PRD §8.1) would need a short-lived store for the
// verifier/state across the redirect; add a cookie-based session store to enable
// them. Left out for MVP to avoid extra infrastructure.

export function configurePassport(): void {
  if (!isGoogleOAuthEnabled) {
    logger.warn(
      "Google OAuth not configured (GOOGLE_CLIENT_ID/SECRET missing) — /api/auth/google is disabled.",
    );
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.googleClientId,
        clientSecret: env.googleClientSecret,
        callbackURL: env.googleCallbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = await findOrCreateGoogleUser(profile);
          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      },
    ),
  );
}

async function findOrCreateGoogleUser(profile: Profile) {
  const providerAccountId = profile.id;
  const email = profile.emails?.[0]?.value?.toLowerCase();
  const displayName = profile.displayName || email?.split("@")[0] || "Google User";

  // 1. Already linked → return that user.
  const linked = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId } },
    include: { user: true },
  });
  if (linked) return linked.user;

  // 2. Link to an existing account with the same email, else create one. Google
  //    has already verified the address, so these users skip our email step.
  let user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: email ?? `google_${providerAccountId}@aerolens.local`,
        displayName,
        emailVerified: true,
      },
    });
  }

  await prisma.oAuthAccount.create({
    data: { userId: user.id, provider: "GOOGLE", providerAccountId },
  });
  return user;
}

export default passport;
