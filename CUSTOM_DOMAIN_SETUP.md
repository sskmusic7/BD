# Custom Domain Setup for bodydoubleapp.com

## Current Status
- **Vercel Project**: `bodydouble`
- **Current Production URL**: `https://bodydouble.vercel.app` (stable, doesn't change)
- **Deployment URLs**: These change with each deployment, but the main URL above stays the same
- **Custom Domain**: `bodydoubleapp.com` (needs to be configured)

## Step 1: Add Domain to Vercel

### Via Vercel Dashboard (Recommended)
1. Go to https://vercel.com/dashboard
2. Select your `bodydouble` project
3. Go to **Settings** → **Domains**
4. Click **Add Domain**
5. Enter: `bodydoubleapp.com`
6. Also add: `www.bodydoubleapp.com` (optional but recommended)

### Via CLI
```bash
# Add the main domain
vercel domains add bodydoubleapp.com bodydouble

# Add www subdomain (optional)
vercel domains add www.bodydoubleapp.com bodydouble
```

**Note**: After running this, Vercel will show you the DNS records you need to configure.

## Step 2: Configure DNS Records

Vercel will show you the DNS records you need to add. You'll need to add these to your domain registrar (where you bought the domain).

### Typical DNS Configuration:

**For bodydoubleapp.com (Apex Domain):**
- **Type**: A
- **Name**: @ (or leave blank)
- **Value**: `76.76.21.21` (Vercel's IP - check Vercel dashboard for current IP)

**OR use CNAME (easier):**
- **Type**: CNAME
- **Name**: @ (or leave blank) 
- **Value**: `cname.vercel-dns.com` (check Vercel dashboard for exact value)

**For www.bodydoubleapp.com:**
- **Type**: CNAME
- **Name**: www
- **Value**: `cname.vercel-dns.com` (check Vercel dashboard for exact value)

### Where to Add DNS Records:
- Go to your domain registrar (GoDaddy, Namecheap, Google Domains, etc.)
- Find DNS Management / DNS Settings
- Add the records Vercel provides
- Wait 24-48 hours for DNS propagation (usually faster, 1-2 hours)

## Step 3: Verify Domain

Vercel will automatically verify your domain once DNS is configured correctly. You can check status in:
- Vercel Dashboard → Project → Settings → Domains

## Step 4: Update Backend CORS (If Needed)

If your backend has CORS restrictions, update `server/index.js`:

```javascript
const corsOptions = {
  origin: [
    'https://bodydoubleapp.com',
    'https://www.bodydoubleapp.com',
    'https://bodydouble.vercel.app', // Keep old URL for backwards compatibility
    // ... other origins
  ],
  // ... rest of config
};
```

## Step 5: Update Environment Variables (If Needed)

If you have any hardcoded URLs, update them:
- Check `src/config/config.js` for any URL references
- Update any documentation or README files

## Verification Checklist

- [ ] Domain added to Vercel project
- [ ] DNS records added at domain registrar
- [ ] DNS propagation complete (check with `nslookup bodydoubleapp.com`)
- [ ] Domain verified in Vercel dashboard
- [ ] Site accessible at https://bodydoubleapp.com
- [ ] HTTPS certificate active (automatic with Vercel)
- [ ] Backend CORS updated (if needed)
- [ ] All features working (login, sessions, etc.)

## Troubleshooting

**Domain not resolving:**
- Wait 24-48 hours for DNS propagation
- Check DNS records are correct
- Use `nslookup bodydoubleapp.com` to verify

**SSL Certificate issues:**
- Vercel automatically provisions SSL certificates
- Wait 5-10 minutes after domain verification

**CORS errors:**
- Update backend CORS to include new domain
- Redeploy backend if needed

## Notes

- The main Vercel URL (`bodydouble.vercel.app`) will continue to work
- Custom domain is just an alias - all deployments automatically work on both URLs
- No code changes needed - just DNS configuration
