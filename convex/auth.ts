import { convexAuth } from "@convex-dev/auth/server";
// import Google from "@auth/core/providers/google";
// Optional later for friends: Password from "@auth/core/providers/password";

/**
 * Convex Auth configuration.
 * - Google OAuth DISABLED (Omegle-style matching does not require login)
 * - Optional later: email/password for remembering friends only
 *
 * Credentials (when re-enabled):
 * - AUTH_GOOGLE_CLIENT_ID / AUTH_GOOGLE_CLIENT_SECRET
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Google({
    //   clientId: process.env.AUTH_GOOGLE_CLIENT_ID || "",
    //   clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET || "",
    // }),
  ],
});
