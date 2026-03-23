import { convexAuth } from "@convex-dev/auth/server";
// import Google from "@auth/core/providers/google";

/**
 * Convex Auth configuration.
 * - OAuth TEMPORARILY DISABLED FOR DEMO
 *
 * Credentials are loaded from environment variables:
 * - AUTH_GOOGLE_CLIENT_ID
 * - AUTH_GOOGLE_CLIENT_SECRET
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // Google({
    //   clientId: process.env.AUTH_GOOGLE_CLIENT_ID,
    //   clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET,
    // }),
  ],
});
