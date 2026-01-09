# 🚀 Google Cloud Run Deployment Guide

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **Google Cloud SDK (gcloud)** installed locally
3. **Docker** installed (for local testing)
4. **GitHub repository** connected

## Initial Setup (One-Time)

### 1. Install Google Cloud SDK

```bash
# macOS
brew install google-cloud-sdk

# Or download from: https://cloud.google.com/sdk/docs/install
```

### 2. Authenticate with Google Cloud

```bash
gcloud auth login
gcloud auth application-default login
```

### 3. Create a Google Cloud Project

```bash
# Create new project
gcloud projects create bodydouble-backend --name="BodyDouble Backend"

# Set as active project
gcloud config set project bodydouble-backend

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### 4. Set Up Cloud Build Trigger (GitHub Integration)

```bash
# Connect GitHub repository
gcloud builds triggers create github \
  --repo-name=BD \
  --repo-owner=sskmusic7 \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml \
  --name=bodydouble-deploy
```

**Or via Console:**
1. Go to [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers)
2. Click "Create Trigger"
3. Connect your GitHub repository
4. Select branch: `main`
5. Configuration: Cloud Build configuration file
6. Location: `cloudbuild.yaml`
7. Create trigger

## Deployment Methods

### Method 1: Automatic Deployment (Recommended)

**Every time you push to GitHub, Cloud Run will auto-deploy:**

```bash
git add .
git commit -m "Your changes"
git push origin main
# Cloud Build automatically triggers and deploys! ✅
```

### Method 2: Manual Deployment via CLI

```bash
# Build and deploy manually
gcloud builds submit --config cloudbuild.yaml
```

### Method 3: Deploy from Local Docker Image

```bash
# Build Docker image
docker build -t gcr.io/bodydouble-backend/bodydouble-backend:latest .

# Push to Google Container Registry
docker push gcr.io/bodydouble-backend/bodydouble-backend:latest

# Deploy to Cloud Run
gcloud run deploy bodydouble-backend \
  --image gcr.io/bodydouble-backend/bodydouble-backend:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1
```

## Get Your Backend URL

After deployment, get your Cloud Run URL:

```bash
gcloud run services describe bodydouble-backend \
  --region us-central1 \
  --format 'value(status.url)'
```

**Example output:**
```
https://bodydouble-backend-xxxxx-uc.a.run.app
```

## Update Frontend Configuration

### Update Vercel Environment Variable

1. Go to [Vercel Dashboard](https://vercel.com/kayahs-projects/bodydouble/settings/environment-variables)
2. Add/Update environment variable:
   - **Key**: `REACT_APP_SERVER_URL`
   - **Value**: `https://bodydouble-backend-xxxxx-uc.a.run.app`
   - **Environment**: Production, Preview, Development
3. Redeploy frontend:
   ```bash
   vercel --prod
   ```

## Environment Variables (Optional)

If you need to set environment variables in Cloud Run:

```bash
gcloud run services update bodydouble-backend \
  --region us-central1 \
  --update-env-vars NODE_ENV=production
```

## Monitoring & Logs

### View Logs

```bash
gcloud run services logs read bodydouble-backend \
  --region us-central1 \
  --limit 50
```

### View in Console

- [Cloud Run Services](https://console.cloud.google.com/run)
- [Cloud Build History](https://console.cloud.google.com/cloud-build/builds)

## Health Check

Test your deployed backend:

```bash
curl https://your-cloud-run-url.run.app/health
```

Should return: `OK`

## Cost Optimization

Cloud Run charges only for:
- **CPU time** (while handling requests)
- **Memory** (while container is running)
- **Requests** (per million requests)

**Free Tier:**
- 2 million requests/month
- 360,000 GB-seconds of memory
- 180,000 vCPU-seconds

**Recommended Settings:**
- Min instances: 0 (scales to zero when idle)
- Max instances: 10 (adjust based on traffic)
- Memory: 512Mi (sufficient for Node.js)
- CPU: 1 (can scale up if needed)

## Troubleshooting

### Check Deployment Status

```bash
gcloud run services describe bodydouble-backend \
  --region us-central1
```

### View Build Logs

```bash
gcloud builds list --limit=5
gcloud builds log <BUILD_ID>
```

### Common Issues

1. **Port not exposed**: Ensure server listens on `0.0.0.0` (already fixed)
2. **CORS errors**: Update CORS origins in `server/index.js`
3. **Build fails**: Check `cloudbuild.yaml` syntax
4. **Service not accessible**: Ensure `--allow-unauthenticated` flag is set

## Update CORS in server/index.js

After getting your Cloud Run URL, update CORS if needed:

```javascript
// In server/index.js, you can add specific origins:
const allowedOrigins = [
  'https://bodydouble.vercel.app',
  'https://bodydouble-giri7kmp0-kayahs-projects.vercel.app',
  // Add your Cloud Run URL if needed
];
```

## Next Steps

1. ✅ Deploy backend to Cloud Run
2. ✅ Get Cloud Run URL
3. ✅ Update Vercel environment variable `REACT_APP_SERVER_URL`
4. ✅ Redeploy frontend
5. ✅ Test the connection

---

**Your new architecture:**
- **Frontend**: Vercel (`bodydouble.vercel.app`)
- **Backend**: Google Cloud Run (`bodydouble-backend-xxxxx-uc.a.run.app`)

