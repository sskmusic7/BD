import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";

// Debug: Log environment variables
const clientId = process.env.AUTH_GOOGLE_CLIENT_ID;
const clientSecret = process.env.AUTH_GOOGLE_CLIENT_SECRET;
console.log('[Auth Debug] AUTH_GOOGLE_CLIENT_ID:', clientId ? `${clientId.substring(0, 10)}...` : 'UNDEFINED');
console.log('[Auth Debug] AUTH_GOOGLE_CLIENT_SECRET:', clientSecret ? 'SET' : 'UNDEFINED');

/**
 * Convex Auth configuration.
 * - Google: OAuth sign in
 *
 * Env vars required:
 * - SITE_URL: Your app URL (e.g. https://bodydoubleapp.com) - set via `npx convex env set SITE_URL`
 * - AUTH_GOOGLE_CLIENT_ID, AUTH_GOOGLE_CLIENT_SECRET: From Google Cloud Console
 *
 * Note: Convex Auth automatically uses SITE_URL env var for OAuth redirects.
 * The OAuth callback URL format is: https://[deployment].convex.site/api/auth/callback/[provider]
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ...(clientId && clientSecret ? [
      Google({
        clientId,
        clientSecret,
        authorization: {
          params: {
            prompt: "consent",
            access_type: "offline",
          },
        },
      }),
    ] : []),
  ],
});
