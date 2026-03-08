# OAuth Debug Session - March 6, 2026

## Current Issue
OAuth sign-in is failing with `Server Error` when calling `auth:signIn` on production deployment.

## Deployment Setup

### TWO Convex Deployments:
| Deployment | Purpose | URL |
|------------|---------|-----|
| `posh-lobster-71` | Development (localhost) | https://posh-lobster-71.eu-west-1.convex.cloud |
| `good-albatross-238` | **Production** (bodydoubleapp.com) | https://good-albatross-238.eu-west-1.convex.cloud |

### Current Configuration:
- **Vercel Environment Variable**: `REACT_APP_CONVEX_URL=https://good-albatross-238.eu-west-1.convex.cloud` ✅
- **Production Site**: https://bodydoubleapp.com
- **Production Convex Deployment**: good-albatross-238

### Environment Variables on Production:
```
AUTH_GOOGLE_CLIENT_ID=<your-client-id>
AUTH_GOOGLE_CLIENT_SECRET=<your-client-secret>
SITE_URL=https://bodydoubleapp.com
```

### Google Cloud Console OAuth Callback URLs:
✅ **Correct URL (Added):**
```
https://good-albatross-238.eu-west-1.convex.site/api/auth/callback/google
```

~~Old URL (can be removed):~~
```
https://posh-lobster-71.eu-west-1.convex.site/api/auth/callback/google
```

## Current Auth Configuration

**File:** `convex/auth.ts`
```typescript
import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
        },
      },
    }),
  ],
});
```

## Package Versions:
```json
"@auth/core": "^0.37.0",
"@convex-dev/auth": "^0.0.91",
"convex": "^1.32.0",
```

## Error Messages:

### Client-Side Error:
```
[CONVEX A(auth:signIn)] [Request ID: 203342a133346272] Server Error
Called by client
```

### Google OAuth Error (Before fixing callback URL):
```
Error 401: invalid_client
The OAuth client was not found.
```
This was fixed by adding the production callback URL to Google Cloud Console.

## What's Been Tried:

1. ✅ Updated Vercel to use production Convex deployment
2. ✅ Set environment variables on production deployment
3. ✅ Deployed auth configuration to production
4. ✅ Added production callback URL to Google Cloud Console
5. ✅ Removed Password provider (temporarily) to isolate Google OAuth
6. ✅ Removed conditional check for hasGoogle
7. ✅ Added authorization params to Google provider
8. ✅ Checked environment variables (all present and correct)

## Next Steps to Debug:

### 1. Check Convex Dashboard Logs (CRITICAL!)
**URL:** https://dashboard.convex.dev/t/sskmusic7/bodydouble/good-albatross-238/logs

**What to do:**
1. Open the URL above
2. Click "Continue with Google" on https://bodydoubleapp.com
3. Immediately check the logs for the error details
4. Look for the actual error stack trace (not just "Server Error")

**Expected to see:**
```
Error: <actual error message>
  at <function name>
  at <file>:<line>
```

### 2. Possible Issues to Investigate:

**A. Environment Variables Not Being Read:**
- Check if `process.env` is accessible in Convex functions
- May need to use a different pattern for accessing env vars

**B. Version Incompatibility:**
- @auth/core 0.37.0 might not be compatible with @convex-dev/auth 0.0.91
- Check Convex auth docs for compatible versions

**C. Provider Configuration:**
- Google provider might need different configuration for Convex
- Check if additional parameters are required

**D. SITE_URL Configuration:**
- SITE_URL might need to be set differently (not via env var)
- May need to be configured in Convex dashboard instead

### 3. Quick Fixes to Try:

**Option A: Update @auth/core version**
```bash
npm install @auth/core@latest
```

**Option B: Try different Google provider configuration**
```typescript
Google({
  clientId: process.env.AUTH_GOOGLE_CLIENT_ID!,
  clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET!,
})
```
(Remove the authorization params we added)

**Option C: Check if Convex deployment has auth enabled**
- Go to: https://dashboard.convex.dev/t/sskmusic7/bodydouble/good-albatross-238/settings
- Check if there's an "Auth" section that needs to be enabled

## Commands to Run:

### Check environment variables:
```bash
CONVEX_DEPLOYMENT=prod:good-albatross-238 npx convex env list
```

### View logs:
```bash
CONVEX_DEPLOYMENT=prod:good-albatross-238 npx convex logs --prod
```

### Deploy to production:
```bash
CONVEX_DEPLOYMENT=prod:good-albatross-238 npx convex deploy -y --typecheck=disable
```

### Deploy to Vercel:
```bash
vercel deploy --prod
```

## Git History (Recent Commits):

```
5543445 - Add authorization params to Google provider and handle missing env vars
59d784f - Fix auth: always include Google provider (remove conditional check)
aaacd25 - Fix auth error - remove Password provider temporarily to isolate Google OAuth issue
7b90caf - Fix OAuth flickering - remove duplicate useEffect and waitingForAuth state
22cdb20 - Reduce debug logging spam to fix glitching behavior
bd93908 - Fix OAuth redirect loop - update parameter names and remove redirectTo
```

## Files Modified:
- `convex/auth.ts` - Auth configuration
- `src/App.js` - Auth state management and debugging
- `src/components/AuthScreen.js` - OAuth sign-in handler
- `src/index.js` - Convex client initialization
- `vercel.json` - Deployment configuration

## Important Notes:

1. **Password provider was temporarily removed** to isolate the Google OAuth issue. It can be added back once Google OAuth works.

2. **Local development still uses dev deployment** (`posh-lobster-71`), which is correct.

3. **Production uses prod deployment** (`good-albatross-238`), which is correct.

4. **Service-worker errors in console are browser extension noise** - ignore them.

5. **The real issue is server-side** - need to see Convex dashboard logs for actual error.

## Contact:
- Project: BodyDouble
- Team: sskmusic7
- Production URL: https://bodydoubleapp.com
- Convex Dashboard: https://dashboard.convex.dev/t/sskmusic7/bodydouble

---
**Last Updated:** March 6, 2026
**Status:** Waiting for Convex dashboard logs to diagnose Server Error
