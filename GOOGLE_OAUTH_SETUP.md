# Google OAuth Setup for BodyDouble

## Step 1: Fix Redirect URI in Google Cloud Console

**Current (WRONG):**
```
https://posh-lobster-71.eu-west-1.convex.siteo/auth/callback/google
```

**Correct Redirect URI:**
```
https://posh-lobster-71.eu-west-1.convex.site/oauth/callback/google
```

**Changes needed:**
1. Fix typo: `convex.siteo` → `convex.site`
2. Fix path: `/auth/callback/google` → `/oauth/callback/google`

## Step 2: Copy Credentials

After saving the OAuth client in Google Cloud Console:
1. Copy the **Client ID** (looks like: `123456789-abcdefghijklmnop.apps.googleusercontent.com`)
2. Copy the **Client Secret** (looks like: `GOCSPX-abcdefghijklmnopqrstuvwxyz`)

## Step 3: Set Convex Environment Variables

### Option A: Via CLI (Recommended)

```bash
# Set Google OAuth Client ID
npx convex env set AUTH_GOOGLE_CLIENT_ID "your-client-id-here"

# Set Google OAuth Client Secret
npx convex env set AUTH_GOOGLE_CLIENT_SECRET "your-client-secret-here"

# Set your site URL (for OAuth redirects)
npx convex env set CONVEX_SITE_URL "https://bodydoubleapp.com"
```

### Option B: Via Convex Dashboard

1. Go to: https://dashboard.convex.dev/t/sskmusic7/bodydouble/posh-lobster-71
2. Navigate to **Settings** → **Environment Variables**
3. Add:
   - `AUTH_GOOGLE_CLIENT_ID` = (your Client ID)
   - `AUTH_GOOGLE_CLIENT_SECRET` = (your Client Secret)
   - `CONVEX_SITE_URL` = `https://bodydoubleapp.com`

## Step 4: Verify Setup

After setting the environment variables, restart your Convex dev server:

```bash
npm run convex:dev
```

The Google OAuth provider will be automatically enabled when both `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET` are set.

## Troubleshooting

**Error: "Invalid Redirect URI"**
- Make sure you're using: `https://posh-lobster-71.eu-west-1.convex.site/oauth/callback/google`
- Check for typos in the domain (`convex.site`, not `convex.siteo`)

**Google Sign-In not appearing**
- Verify environment variables are set: `npx convex env list`
- Check that both `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET` are present
- Restart `convex dev` after setting variables

**OAuth redirect fails**
- Ensure `CONVEX_SITE_URL` matches your production domain
- Verify the redirect URI in Google Cloud Console matches exactly
