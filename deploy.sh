#!/bin/bash

echo "🚀 BodyDouble Deployment Script"
echo "================================"

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📁 Initializing git repository..."
    git init
    git add .
    git commit -m "Initial BodyDouble app commit"
    echo "✅ Git repository created"
    echo ""
    echo "📝 Next steps:"
    echo "1. Create a GitHub repository at https://github.com/new"
    echo "2. Run: git remote add origin https://github.com/yourusername/bodydouble.git"
    echo "3. Run: git push -u origin main"
    echo ""
    echo "🌐 Then deploy:"
    echo "Backend → Railway: https://railway.app"
    echo "Frontend → Vercel: https://vercel.com"
    exit 0
fi

# Check if remote exists
if ! git remote | grep -q origin; then
    echo "❌ No git remote found. Please add your GitHub repository:"
    echo "git remote add origin https://github.com/yourusername/bodydouble.git"
    exit 1
fi

# Commit any changes
echo "📝 Committing latest changes..."
git add .
git commit -m "Update for deployment" || echo "No changes to commit"

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Code pushed to GitHub!"
echo ""
echo "🌐 Now deploy:"
echo "1. Backend → Railway: https://railway.app (auto-detects Node.js)"
echo "2. Frontend → Vercel: https://vercel.com (set root directory to 'client')"
echo ""
echo "🔧 Don't forget to:"
echo "- Set REACT_APP_SERVER_URL in Vercel to your Railway backend URL"
echo "- Set FRONTEND_URL in Railway to your Vercel frontend URL"
