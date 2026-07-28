import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { prisma } from "./prisma.js";
import { env, isGoogleOAuthEnabled } from "./env.js";
import { logger } from "./logger.js";

// Passport only runs the OAuth code exchange. We don't use passport sessions;
// the callback controller mints our own JWT cookie session so that credential
// login and Google login end up in exactly the same place.
//
// NOTE: this is the confidential-client code flow, where the client secret
// secures the exchange. PKCE and state would need somewhere to keep the verifier
// across the redirect, which means adding a session store.

export function configurePassport(): void {
  if (!isGoogleOAuthEnabled) {
    logger.warn("Google OAuth not configured, /api/auth/google is disabled.");
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
          done(null, await findOrCreateGoogleUser(profile));
        } catch (error) {
          done(error as Error);
        }
      },
    ),
  );
}

// NOTE: only trust the address when Google says it verified it. Linking on an
// unverified address would let anyone who can set that address on a Google
// account take over the matching local account.
function verifiedEmail(profile: Profile): string | undefined {
  const claims = profile._json as { email?: string; email_verified?: boolean };
  if (!claims.email_verified) return undefined;
  return claims.email?.toLowerCase();
}

async function findOrCreateGoogleUser(profile: Profile) {
  const providerAccountId = profile.id;
  const email = verifiedEmail(profile);
  const displayName = profile.displayName || email?.split("@")[0] || "Google User";

  // Already linked, nothing else to do.
  const linked = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId } },
    include: { user: true },
  });
  if (linked) return linked.user;

  // Otherwise attach to the account with that email, or create one. Google has
  // already verified the address, so these users skip our own email step.
  let user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user) {
    user = await prisma.user.create({
      data: {
        // Falls back to a placeholder so an account with no usable email still
        // gets a unique, non-colliding row.
        email: email ?? `google_${providerAccountId}@nasight.local`,
        displayName,
        emailVerified: Boolean(email),
      },
    });
  }

  await prisma.oAuthAccount.create({
    data: { userId: user.id, provider: "GOOGLE", providerAccountId },
  });
  return user;
}

export default passport;
