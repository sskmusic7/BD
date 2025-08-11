# BodyDouble Deployment Guide

## 🚀 Quick Deploy Options

### Option 1: Railway (Recommended for Backend)

1. **Create Railway account**: https://railway.app
2. **Connect your GitHub repo**
3. **Deploy backend**:
   - Select your repository
   - Railway will auto-detect the Node.js app
   - Set environment variables:
     - `PORT` (Railway will set this automatically)
     - `NODE_ENV=production`
   - Deploy will start automatically

### Option 2: Render (Alternative Backend)

1. **Create Render account**: https://render.com
2. **Create new Web Service**
3. **Connect your GitHub repo**
4. **Configure**:
   - Build Command: `npm install`
   - Start Command: `node server/index.js`
   - Environment: `NODE_ENV=production`

### Option 3: Vercel (Frontend)

1. **Create Vercel account**: https://vercel.com
2. **Import your GitHub repo**
3. **Configure**:
   - Framework: React
   - Root Directory: `client`
   - Build Command: `npm run build`
   - Output Directory: `build`
   - Environment Variables:
     - `REACT_APP_SERVER_URL=https://your-backend-url.railway.app`

### Option 4: Netlify (Alternative Frontend)

1. **Create Netlify account**: https://netlify.com
2. **Drag and drop** your `client/build` folder after running `npm run build`
3. **Set environment variables**:
   - `REACT_APP_SERVER_URL=https://your-backend-url.railway.app`

## 📋 Step-by-Step Deployment

### Step 1: Deploy Backend

1. **Push to GitHub** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial BodyDouble app"
   git branch -M main
   git remote add origin https://github.com/yourusername/bodydouble.git
   git push -u origin main
   ```

2. **Deploy to Railway**:
   - Go to https://railway.app
   - Click "Start a New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Railway will automatically detect and deploy

3. **Get your backend URL** (e.g., `https://bodydouble-production.up.railway.app`)

### Step 2: Deploy Frontend

1. **Update environment variables**:
   ```bash
   cd client
   echo "REACT_APP_SERVER_URL=https://your-backend-url.railway.app" > .env.production
   ```

2. **Build the frontend**:
   ```bash
   npm run build
   ```

3. **Deploy to Vercel**:
   - Go to https://vercel.com
   - Import your GitHub repository
   - Set Root Directory to `client`
   - Add environment variable: `REACT_APP_SERVER_URL=https://your-backend-url.railway.app`
   - Deploy

## 🔧 Environment Variables

### Backend (.env)
```
NODE_ENV=production
PORT=5002
```

### Frontend (.env.production)
```
REACT_APP_SERVER_URL=https://your-backend-url.railway.app
```

## 🌐 Custom Domain (Optional)

1. **Backend**: Add custom domain in Railway/Render dashboard
2. **Frontend**: Add custom domain in Vercel/Netlify dashboard
3. **Update CORS**: Update the CORS origin in `server/index.js` to your frontend domain

## 🔒 HTTPS Requirements

- **WebRTC requires HTTPS** in production for camera/microphone access
- Both Railway and Vercel provide HTTPS automatically
- Make sure your backend URL uses `https://` not `http://`

## 📱 Mobile Considerations

- The app is responsive and works on mobile devices
- Camera/microphone permissions will be requested on first use
- iOS Safari requires user interaction before accessing media devices

## 🛠 Troubleshooting

- **CORS errors**: Update the origin in `server/index.js` to match your frontend URL
- **WebRTC not working**: Ensure both frontend and backend are served over HTTPS
- **Connection issues**: Check that the `REACT_APP_SERVER_URL` environment variable is set correctly
