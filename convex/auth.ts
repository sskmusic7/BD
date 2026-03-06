import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";

const hasGoogle = process.env.AUTH_GOOGLE_CLIENT_ID && process.env.AUTH_GOOGLE_CLIENT_SECRET;

/**
 * Convex Auth configuration.
 * - Google: OAuth sign in (when env vars configured)
 *
 * Env vars required:
 * - SITE_URL: Your app URL (e.g. https://bodydoubleapp.com) - set via `npx convex env set SITE_URL`
 * - AUTH_GOOGLE_CLIENT_ID, AUTH_GOOGLE_CLIENT_SECRET: From Google Cloud Console (optional)
 *
 * Note: Convex Auth automatically uses SITE_URL env var for OAuth redirects.
 * The OAuth callback URL format is: https://[deployment].convex.site/api/auth/callback/[provider]
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    ...(hasGoogle
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_CLIENT_ID!,
            clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
});
