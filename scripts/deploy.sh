#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Pull latest changes
git pull origin main

# Install dependencies
npm ci

# Build applications
echo "📦 Building applications..."
npx nx build shared-types
npx nx build portfolio --configuration=production
npx nx build portfolio-api --configuration=production

# Restart backend
echo "🔄 Restarting backend..."
pm2 restart portfolio-api

# Reload nginx
echo "🔄 Reloading nginx..."
sudo nginx -s reload

echo "✅ Deployment complete!"