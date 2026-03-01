# Convex Setup for BodyDouble

## Prerequisites

- Node.js 18+
- A Convex account (free at [convex.dev](https://convex.dev))

## Setup Steps

### 1. Install and Login

```bash
npm install
npx convex dev
```

When prompted, log in to Convex (opens browser). This creates a project and generates `convex/_generated/`.

### 2. Environment Variables

Create `.env.local` in the project root:

```
REACT_APP_CONVEX_URL=<your Convex deployment URL from dashboard>
CONVEX_SITE_URL=https://bodydoubleapp.com
AUTH_GOOGLE_CLIENT_ID=<from Google Cloud Console>
AUTH_GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
```

For Google OAuth:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials (Web application)
3. Add authorized redirect: `https://<your-convex-deployment>.convex.site/oauth/callback/google`

### 3. Deploy Convex

```bash
npx convex deploy
```

### 4. Configure Vercel

Add `REACT_APP_CONVEX_URL` to your Vercel project environment variables.

## Features Enabled with Convex

- **Auth**: Email+password and Google OAuth sign-in
- **Users**: Persistent user profiles with username
- **Friends**: Convex-backed friend list
- **Invite Links**: Shareable `/invite/:token` links that add friends

## Legacy Mode

When `REACT_APP_CONVEX_URL` is not set, the app runs in legacy mode:
- No Convex auth (name-only profile)
- Socket-based friends (file storage on backend)
- No invite links
