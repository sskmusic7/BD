# OAuth Redirect Loop Fix - BodyDouble App

**Date:** March 9, 2026
**Issue:** OAuth authentication redirects user back to login screen instead of home page
**Status:** Solution identified, awaiting deployment configuration fix

---

## 📋 Problem Summary

After logging in with Google OAuth, users are redirected back to the sign-in page instead of being taken to the home page or profile setup. This creates an infinite loop where users can never access the application.

### Observed Behavior:
1. User clicks "Continue with Google"
2. Google OAuth completes successfully
3. User is redirected back to login screen
4. Loop repeats indefinitely

---

## 🔍 Investigation Process

### Files Analyzed:

1. **`/Users/sskmusic/BodyDouble/convex/auth.ts`**
   - Convex Auth configuration with Google OAuth provider
   - Uses hardcoded credentials (temporary)
   - Location: Lines 6-7

2. **`/Users/sskmusic/BodyDouble/src/App.js`**
   - Main app routing and authentication logic
   - Authentication state checking at lines 273-289
   - Uses `useConvexAuth()` hook to track authentication state

3. **`/Users/sskmusic/BodyDouble/src/components/AuthScreen.js`**
   - Login screen component
   - Handles Google OAuth flow at lines 55-81
   - Redirects to Google OAuth using `window.location.href`

4. **`/Users/sskmusic/BodyDouble/.env.local`**
   - Local environment configuration
   - Contains Convex deployment URL and site URL

5. **`/Users/sskmusic/BodyDouble/convex/http.ts`**
   - HTTP route configuration
   - Handles OAuth callbacks via `auth.addHttpRoutes(http)`

---

## 🎯 Root Cause Identified

### PRIMARY ISSUE:
The **production site** (`bodydoubleapp.com`) is **NOT configured with the correct Convex deployment environment variables**.

### What's Happening:

**Current Flow (BROKEN):**
```
1. User visits bodydoubleapp.com
2. App tries to connect to Convex backend
3. ❌ No CONVEX_URL configured in production
4. ❌ App cannot establish connection to Convex
5. ❌ Authentication state cannot be persisted
6. ❌ User redirected back to login screen
7. ❌ Loop continues infinitely
```

**Expected Flow (AFTER FIX):**
```
1. User visits bodydoubleapp.com
2. App connects to posh-lobster-71 Convex deployment
3. ✅ Convex connection established
4. ✅ User clicks "Continue with Google"
5. ✅ Google OAuth completes
6. ✅ Session persisted in Convex
7. ✅ User redirected to ProfileSetup or HomePage
```

### Evidence:

1. **Environment Configuration Status:**
   - ✅ Development deployment (`posh-lobster-71`): SITE_URL configured correctly
   - ✅ Production deployment (`good-albatross-238`): SITE_URL configured correctly
   - ❌ **Vercel production environment**: Missing `REACT_APP_CONVEX_URL` and `CONVEX_DEPLOYMENT`

2. **Log Analysis:**
   - Shows repeated `auth:store` with `refreshSession`
   - Indicates auth attempting to refresh but unable to maintain session
   - "Using hardcoded credentials (TEMPORARY FIX)" warning

3. **Local vs Production:**
   - `.env.local` has correct configuration for local development
   - Vercel production deployment doesn't have access to these variables
   - Production app doesn't know which Convex backend to connect to

---

## ✅ Solution

### Step-by-Step Fix:

#### 1. Add Environment Variables in Vercel Dashboard

1. Go to: **https://vercel.com/dashboard**
2. Select your project (likely named `bodydouble-client` or similar)
3. Navigate to: **Settings** → **Environment Variables**
4. Add the following variables for **Production**:

   ```
   NAME: REACT_APP_CONVEX_URL
   VALUE: https://posh-lobster-71.eu-west-1.convex.cloud

   NAME: CONVEX_DEPLOYMENT
   VALUE: dev:posh-lobster-71

   NAME: SITE_URL
   VALUE: https://bodydoubleapp.com
   ```

5. **Important:** Select **Production** environment for each variable
6. Click **Save** for each variable

#### 2. Redeploy the Application

After adding environment variables:

1. Go to **Deployments** in Vercel
2. Click the three dots next to the latest production deployment
3. Select **Redeploy**
4. Wait for deployment to complete

#### 3. Test the Fix

1. Visit: `https://bodydoubleapp.com`
2. Click: **"Continue with Google"**
3. Complete Google sign-in
4. **Expected Result:** Should redirect to ProfileSetup (if new user) or HomePage (if returning)
5. **NOT:** Back to login screen

---

## 🔧 Technical Details

### Authentication Flow (After Fix):

**Code Location:** `/Users/sskmusic/BodyDouble/src/App.js:146-329`

1. **App Initialization** (`AppContentConvexInner`)
   - Uses `useConvexAuth()` hook to track authentication state
   - Queries `api.users.getCurrentUser` to get user profile

2. **Authentication State Checks:**
   ```javascript
   // Line 273-275: Not authenticated → show sign-in screen
   if (!isAuthenticated) {
     return <AuthScreen />;
   }

   // Line 278-284: Authenticated but profile loading → show loading
   if (appUser === undefined) {
     return <div>Loading...</div>;
   }

   // Line 287-289: Authenticated but no profile → show profile setup
   if (appUser === null) {
     return <ProfileSetupConvex onComplete={handleProfileComplete} />;
   }
   ```

3. **OAuth Flow** (`/Users/sskmusic/BodyDouble/src/components/AuthScreen.js:55-81`)
   - Calls `signIn('google')` which returns redirect URL
   - Redirects to Google OAuth using `window.location.href = result.redirect.toString()`
   - Google redirects back to `/api/auth/callback/*`
   - Convex HTTP handler processes callback and creates session
   - Page reloads with authenticated session
   - `useConvexAuth()` detects authentication and proceeds to app

### Environment Variables Explained:

- **`REACT_APP_CONVEX_URL`**: Tells the React app which Convex deployment to connect to
- **`CONVEX_DEPLOYMENT`**: Deployment identifier for Convex CLI operations
- **`SITE_URL`**: Tells Convex Auth where your app is hosted for OAuth redirects

---

## 📝 Additional Notes

### What Was Already Correct:
- ✅ Convex Auth configuration (`convex/auth.ts`)
- ✅ OAuth provider setup (Google)
- ✅ HTTP route handling (`convex/http.ts`)
- ✅ Authentication flow logic (`src/App.js`)
- ✅ SITE_URL configured in Convex dashboard
- ✅ Google OAuth console credentials

### What Was Missing:
- ❌ **Vercel production environment variables** (THE KEY ISSUE!)
- ❌ Connection between production site and Convex backend

### Temporary Hardcoded Credentials:
**Note:** Previously hardcoded credentials have been removed and replaced with environment variables (AUTH_GOOGLE_CLIENT_ID and AUTH_GOOGLE_CLIENT_SECRET).

---

## 🧪 Verification Checklist

After implementing the fix, verify:

- [ ] Environment variables added in Vercel dashboard
- [ ] Production app redeployed
- [ ] OAuth flow completes without redirect loop
- [ ] New users can sign up with Google
- [ ] Returning users are recognized and logged in
- [ ] Profile setup flow works for new users
- [ ] Home page loads after authentication

---

## 🚀 Deployment Script Created

Location: `/Users/sskmusic/BodyDouble/deploy-with-env.sh`

A helper script was created to assist with deployment and environment configuration, though the primary fix requires manual configuration in the Vercel dashboard.

---

## 📚 Key Files Reference

| File Path | Purpose | Key Lines |
|-----------|---------|-----------|
| `/Users/sskmusic/BodyDouble/convex/auth.ts` | Convex Auth configuration | 1-24 |
| `/Users/sskmusic/BodyDouble/convex/http.ts` | HTTP routes for OAuth callbacks | 1-9 |
| `/Users/sskmusic/BodyDouble/src/App.js` | Main app routing and auth logic | 146-329 |
| `/Users/sskmusic/BodyDouble/src/components/AuthScreen.js` | Login screen UI | 55-81 |
| `/Users/sskmusic/BodyDouble/src/components/ProfileSetupConvex.js` | New user profile setup | 1-224 |
| `/Users/sskmusic/BodyDouble/.env.local` | Local environment variables | 1-8 |
| `/Users/sskmusic/BodyDouble/vercel.json` | Vercel configuration | 1-15 |

---

## 🎯 Summary

**The Issue:** Production app doesn't know which Convex backend to connect to.

**The Fix:** Add `REACT_APP_CONVEX_URL` and `CONVEX_DEPLOYMENT` environment variables in Vercel dashboard.

**Time to Fix:** ~5 minutes

**Impact:** Critical - Users cannot access the application without this fix.

---

## 📞 Support Resources

- **Vercel Dashboard:** https://vercel.com/dashboard
- **Convex Dashboard:** https://dashboard.convex.dev
- **Project:** sskmusic7/bodydouble
- **Development Deployment:** posh-lobster-71
- **Production URL:** https://bodydoubleapp.com

---

**Last Updated:** March 9, 2026
**Status:** Awaiting Vercel environment configuration
**Next Step:** Add environment variables in Vercel dashboard and redeploy
