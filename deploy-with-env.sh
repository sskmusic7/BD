#!/bin/bash

# Deployment script for BodyDouble with proper Convex environment configuration

echo "🚀 Deploying BodyDouble with SITE_URL configuration..."

# Set Convex deployment
export CONVEX_DEPLOYMENT=dev:posh-lobster-71

echo "📝 Setting SITE_URL environment variable..."

# Try to set SITE_URL using convex CLI
# This requires convex to be properly installed
if command -v npx &> /dev/null; then
  echo "Setting SITE_URL via Convex CLI..."
  npx convex env set SITE_URL https://bodydoubleapp.com || echo "⚠️  Could not set SITE_URL via CLI. Please set it manually in the Convex dashboard."
fi

echo "📦 Deploying to Convex..."
npx convex deploy || echo "⚠️  Deploy failed. Please run 'npx convex deploy' manually."

echo ""
echo "✅ Deployment process complete!"
echo ""
echo "📋 IMPORTANT: If SITE_URL was not set automatically:"
echo "   1. Go to https://dashboard.convex.dev"
echo "   2. Select project: sskmusic7/bodydouble"
echo "   3. Go to Settings → Environment Variables"
echo "   4. Add: SITE_URL = https://bodydoubleapp.com"
echo ""
echo "🌐 Your site: https://bodydoubleapp.com"
