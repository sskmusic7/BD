#!/bin/bash

# Quick deployment script for Google Cloud Run
# Usage: ./deploy-cloud-run.sh

set -e

echo "🚀 Deploying BodyDouble Backend to Google Cloud Run"
echo "=================================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get current project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
    echo "❌ Error: No Google Cloud project set"
    echo "Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📦 Project: $PROJECT_ID"
echo ""

# Check if user wants to proceed
read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

# Build and deploy
echo "🔨 Building and deploying..."
gcloud builds submit --config cloudbuild.yaml

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Get your Cloud Run URL:"
echo "   gcloud run services describe bodydouble-backend --region us-central1 --format 'value(status.url)'"
echo ""
echo "2. Update Vercel environment variable REACT_APP_SERVER_URL with the Cloud Run URL"
echo ""
echo "3. Redeploy frontend: vercel --prod"

