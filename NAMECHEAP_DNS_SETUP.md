# Namecheap DNS Configuration for bodydoubleapp.com

## Domain Added to Vercel ✅
- Domain: `bodydoubleapp.com` 
- Project: `bodydouble`
- Status: Added successfully

## DNS Records to Add in Namecheap

### Step 1: Log into Namecheap
1. Go to https://www.namecheap.com
2. Log into your account
3. Go to **Domain List** → Click **Manage** next to `bodydoubleapp.com`

### Step 2: Go to Advanced DNS
1. Click on the **Advanced DNS** tab
2. You'll see existing DNS records (usually A records pointing to parking pages)

### Step 3: Add/Update DNS Records

#### For Apex Domain (bodydoubleapp.com):

**Option A: A Record (if Vercel provides an IP)**
- **Type**: A Record
- **Host**: @
- **Value**: `76.76.21.21` (Vercel's IP - verify in Vercel dashboard)
- **TTL**: Automatic (or 3600)

**Option B: CNAME Record (Recommended - easier to manage)**
- **Type**: CNAME Record  
- **Host**: @
- **Value**: `cname.vercel-dns.com` (verify exact value in Vercel dashboard)
- **TTL**: Automatic (or 3600)

**Note**: Some registrars don't allow CNAME on apex domain. If Namecheap doesn't allow it, use A Record.

#### For www Subdomain:

- **Type**: CNAME Record
- **Host**: www
- **Value**: `cname.vercel-dns.com` (verify exact value in Vercel dashboard)
- **TTL**: Automatic (or 3600)

### Step 4: Remove Old Records
- Delete any existing A records pointing to parking pages or other IPs
- Keep MX records if you're using email
- Keep TXT records for verification/email (SPF, DKIM, etc.)

### Step 5: Save Changes
- Click **Save All Changes** (green checkmark)
- DNS changes can take 1-24 hours to propagate (usually 1-2 hours)

## Verify DNS Configuration

After adding records, verify with:

```bash
# Check A record
nslookup bodydoubleapp.com

# Check CNAME for www
nslookup www.bodydoubleapp.com

# Check DNS propagation
dig bodydoubleapp.com
```

## Get Exact DNS Values from Vercel

Since the CLI access is limited, get the exact values from:

1. **Vercel Dashboard**: https://vercel.com/dashboard
2. Go to **bodydouble** project → **Settings** → **Domains**
3. Click on `bodydoubleapp.com`
4. You'll see the exact DNS records needed

## Common Vercel DNS Values

Typically Vercel uses:
- **A Record**: `76.76.21.21` (but verify in dashboard)
- **CNAME**: `cname.vercel-dns.com` (but verify in dashboard)

## Troubleshooting

**Domain not resolving:**
- Wait 1-24 hours for DNS propagation
- Verify records are correct in Namecheap
- Check Vercel dashboard shows domain as "Valid Configuration"

**SSL Certificate:**
- Vercel automatically provisions SSL certificates
- Wait 5-10 minutes after DNS is configured
- Check in Vercel dashboard → Domains → SSL status

**Still seeing parking page:**
- Clear browser cache
- Try incognito/private browsing
- Check DNS propagation: https://www.whatsmydns.net/#A/bodydoubleapp.com
