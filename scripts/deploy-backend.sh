#!/bin/bash

set -e

echo "🚀 Starting backend deployment..."

# Configuration
PROJECT_NAME="portfolio-api"
DEPLOY_PATH="/var/www/$PROJECT_NAME"
BACKUP_PATH="/var/www/${PROJECT_NAME}-backup-$(date +%Y%m%d-%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root or with sudo
if [[ $EUID -eq 0 ]]; then
    print_warning "Running as root. This is not recommended for production."
fi

# Navigate to project directory
cd "$(dirname "$0")/.."

print_status "Building backend and shared types..."

# Build the projects
npm run build:shared-types
npm run build:backend

print_status "Creating deployment package..."

# Create temporary deployment directory
TEMP_DIR=$(mktemp -d)
mkdir -p "$TEMP_DIR/portfolio-api"

# Copy built files
cp -r dist/apps/portfolio-api/* "$TEMP_DIR/portfolio-api/"
cp -r dist/libs/shared-types "$TEMP_DIR/portfolio-api/"
cp package.json package-lock.json "$TEMP_DIR/portfolio-api/"
cp ecosystem.config.js "$TEMP_DIR/portfolio-api/"

print_status "Backing up current deployment..."

# Create backup if deployment exists
if [ -d "$DEPLOY_PATH" ]; then
    sudo cp -r "$DEPLOY_PATH" "$BACKUP_PATH"
    print_status "Backup created at $BACKUP_PATH"
fi

print_status "Installing new deployment..."

# Create deployment directory
sudo mkdir -p "$DEPLOY_PATH"

# Copy new files
sudo cp -r "$TEMP_DIR/portfolio-api/"* "$DEPLOY_PATH/"

# Set correct permissions
sudo chown -R www-data:www-data "$DEPLOY_PATH"
sudo chmod -R 755 "$DEPLOY_PATH"

print_status "Installing dependencies..."

# Install production dependencies
cd "$DEPLOY_PATH"
sudo -u www-data npm ci --only=production --silent

print_status "Restarting application..."

# Restart PM2 process
if pm2 list | grep -q "$PROJECT_NAME"; then
    pm2 restart "$PROJECT_NAME"
else
    pm2 start ecosystem.config.js --env production
fi

# Wait for application to start
sleep 5

print_status "Running health check..."

# Health check
if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    print_status "✅ Health check passed!"
else
    print_error "❌ Health check failed!"
    print_error "Rolling back to previous version..."
    
    if [ -d "$BACKUP_PATH" ]; then
        sudo rm -rf "$DEPLOY_PATH"
        sudo mv "$BACKUP_PATH" "$DEPLOY_PATH"
        pm2 restart "$PROJECT_NAME"
        sleep 5
        
        if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
            print_status "✅ Rollback successful!"
        else
            print_error "❌ Rollback failed! Manual intervention required."
        fi
    fi
    
    exit 1
fi

# Clean up
rm -rf "$TEMP_DIR"

# Remove old backups (keep last 5)
print_status "Cleaning up old backups..."
ls -t /var/www/${PROJECT_NAME}-backup-* 2>/dev/null | tail -n +6 | xargs -r sudo rm -rf

print_status "🎉 Backend deployment completed successfully!"
print_status "API Documentation: https://giorgi.app/api/docs"
print_status "Health Check: https://giorgi.app/api/health"

# Show PM2 status
pm2 list