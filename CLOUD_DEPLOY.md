# AECI Cloud Deployment Guide
# ==========================
# This setup gives you FREE UNLIMITED demo capability

## Architecture
# -------------
# Local Brain (your PC with Twinmotion)
#    ↓ sends data via HTTP
# Cloud API Server (Render.com - FREE tier)
#    ↓ stores data
# MongoDB Atlas (Cloud DB - FREE forever tier)
#    ↓ serves data
# Dashboard (Vercel - FREE forever)
#    ↓ viewed by anyone worldwide

## STEP 1: MongoDB Atlas (Database)
# ---------------------------------
# 1. Go to https://www.mongodb.com/atlas
# 2. Sign up with Google (free, no credit card)
# 3. Create cluster: Choose "M0 Free Tier" (shared, 512MB storage)
# 4. Wait for cluster to create (~3 minutes)
# 5. Database Access → Add Database User:
#    - Username: aeci_user
#    - Password: generate strong password, SAVE IT
# 6. Network Access → Add IP Address:
#    - Click "Allow Access from Anywhere" (0.0.0.0/0)
#    - Or add specific IPs if you want security
# 7. Clusters → Connect → Drivers → Node.js
# 8. Copy connection string, replace <password> with your password
#    Example: mongodb+srv://aeci_user:YOUR_PASS@cluster0.xxxxx.mongodb.net/aeci?retryWrites=true&w=majority
# 9. SAVE THIS URI - you'll need it for Render

## STEP 2: Render.com (API Server)
# --------------------------------
# 1. Go to https://render.com
# 2. Sign up with GitHub (free)
# 3. Dashboard → New → Web Service
# 4. Connect your GitHub repo: Abhi-0888/X3
# 5. Configure:
#    - Name: aeci-api-server
#    - Environment: Node
#    - Region: Choose closest to you (Singapore/Oregon/Frankfurt)
#    - Branch: main
#    - Build Command: cd artifacts/api-server && npm install && npm run build
#    - Start Command: cd artifacts/api-server && npm start
# 6. Environment Variables:
#    - NODE_ENV = production
#    - PORT = 10000
#    - BASE_PATH = /
#    - DATABASE_URL = your_mongodb_atlas_uri_from_step_1
# 7. Click "Create Web Service"
# 8. Wait for deploy (~5 minutes)
# 9. Copy the URL: https://aeci-api-server.onrender.com (or similar)
# 10. SAVE THIS URL - you'll need it for dashboard and brain

## STEP 3: Vercel (Dashboard)
# ----------------------------
# 1. Go to https://vercel.com
# 2. Sign up with GitHub (free)
# 3. Add New Project → Import GitHub repo: Abhi-0888/X3
# 4. Configure:
#    - Framework Preset: Vite
#    - Root Directory: artifacts/aeci-dashboard
#    - Build Command: npm run build
#    - Output Directory: dist/public
# 5. Environment Variables:
#    - VITE_API_URL = https://your-render-url.onrender.com (from step 2)
# 6. Click Deploy
# 7. Wait for deploy (~2 minutes)
# 8. Your dashboard is live! Copy the URL

## STEP 4: Update Local Brain
# --------------------------
# Edit brain/.env file:
# AECI_API_URL=https://your-render-url.onrender.com/api
#
# Then restart brain:
# cd brain
# py brain.py

## DONE! 🎉
# ---------
# Dashboard URL (Vercel): https://aeci-dashboard.vercel.app (or similar)
# API URL (Render): https://aeci-api-server.onrender.com
# Database: MongoDB Atlas (cloud)
# Brain: Running on your local PC with Twinmotion
#
# Now anyone worldwide can view your live Twinmotion feed through the Vercel dashboard!

## Free Tier Limits (All Unlimited for Demo)
# ------------------------------------------
# MongoDB Atlas: 512MB storage, FREE forever
# Render: 750 hours/month (always on for 1 service), FREE
# Vercel: Unlimited bandwidth, 100GB bandwidth/month, FREE forever

## Troubleshooting
# ----------------
# If Render sleeps (15 min inactivity):
# - Use https://uptimerobot.com (free) to ping your API every 5 minutes
# - Or upgrade Render ($7/month for always-on)
#
# If brain can't connect to cloud API:
# - Check AECI_API_URL has "/api" at the end
# - Verify Render service is running (check dashboard)
# - Try http:// instead of https:// for local testing
#
# If dashboard shows no data:
# - Check Vercel environment variable VITE_API_URL is set correctly
# - Verify API health: https://your-api.onrender.com/api/healthz
# - Redeploy dashboard after changing env vars
