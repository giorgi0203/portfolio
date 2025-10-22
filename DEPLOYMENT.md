# Portfolio Deployment Guide - DigitalOcean

This guide covers deploying both the Angular frontend and NestJS backend to DigitalOcean.

## Project Structure

```
portfolio/
├── apps/
│   ├── portfolio/           # Angular frontend
│   ├── portfolio-api/       # NestJS backend  
│   └── portfolio-api-e2e/   # E2E tests
├── libs/
│   └── shared-types/        # Shared TypeScript interfaces
└── scripts/
    └── setup-server.sh      # Server setup script
```

## CI/CD Workflows

This project includes **two separate GitHub Actions workflows** for automated deployment:

### Frontend Deployment (`.github/workflows/ci.yml`)
- **Triggers**: Any push to `main` branch
- **Deploys**: Angular frontend to `/var/www/portfolio/current/`
- **Server**: Nginx serves static files

### Backend Deployment (`.github/workflows/backend-deploy.yml`)
- **Triggers**: Push to `main` with backend changes (`apps/portfolio-api/**`, `libs/shared-types/**`)
- **Deploys**: NestJS API to `/var/www/portfolio-api/current/`
- **Server**: PM2 process manager with auto-restart

Both workflows use the same GitHub secrets and `appleboy/ssh-action` for consistent deployment.

## Prerequisites

- DigitalOcean account
- Domain name (e.g., giorgi.app)
- SSH key for server access
- Node.js 20+ for local development
- GitHub repository with configured secrets

## Step 1: Create DigitalOcean Droplet

1. **Create Droplet**:
   - Image: Ubuntu 22.04 LTS
   - Size: Basic $12/month (2GB RAM, 1 vCPU)
   - Region: Choose closest to your users
   - Authentication: Add your SSH key
   - Hostname: `portfolio-server`

2. **Enable IPv6** (for Starlink compatibility):
   - In Droplet settings → Networking
   - Enable IPv6 support

## Step 2: Initial Server Setup

SSH into your droplet:
```bash
ssh root@your-droplet-ip
```

### Update system and install dependencies:
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs

# Install nginx
apt install nginx -y

# Install PM2 for process management
npm install -g pm2

# Install certbot for SSL
apt install certbot python3-certbot-nginx -y

# Create application user
useradd -m -s /bin/bash portfolio
usermod -aG sudo portfolio
```

## Step 3: Setup Application Directory

```bash
# Create application directory
mkdir -p /var/www/portfolio
chown portfolio:portfolio /var/www/portfolio

## Step 5: Configure Nginx

Create nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/portfolio
```

Add this configuration:
```nginx
server {
    listen 80;
    listen [::]:80;  # IPv6 support
    server_name giorgi.app www.giorgi.app;

    # Frontend (Angular)
    root /var/www/portfolio/dist/apps/portfolio;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Frontend routes
    location / {
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API routes to backend
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

## Step 6: Setup Backend with PM2

Create PM2 ecosystem file:
```bash
nano /var/www/portfolio/ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'portfolio-api',
    script: './dist/apps/portfolio-api/main.js',
    cwd: '/var/www/portfolio',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

Start the backend:
```bash
# Create logs directory
mkdir -p /var/www/portfolio/logs

# Start backend with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow the instructions to enable auto-start
```

## Step 7: Configure DNS

In your DNS provider (or DigitalOcean DNS):

### IPv4 Records:
```
Type: A
Name: @
Value: your-droplet-ipv4
TTL: 3600

Type: A
Name: www
Value: your-droplet-ipv4
TTL: 3600
```

### IPv6 Records (for Starlink compatibility):
```
Type: AAAA
Name: @
Value: your-droplet-ipv6
TTL: 3600

Type: AAAA
Name: www
Value: your-droplet-ipv6
TTL: 3600
```

## Step 8: Setup SSL Certificate

```bash
# Generate SSL certificates
sudo certbot --nginx -d giorgi.app -d www.giorgi.app

# Test auto-renewal
sudo certbot renew --dry-run
```

## Step 9: Setup Firewall

```bash
# Enable UFW firewall
sudo ufw enable

# Allow necessary ports
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS

# Check status
sudo ufw status
```

## Step 10: Create Deployment Script

Create automated deployment script:
```bash
nano /var/www/portfolio/deploy.sh
```

```bash
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
```

Make it executable:
```bash
chmod +x /var/www/portfolio/deploy.sh
```

## Development Workflow

### Local Development:
```bash
# Start frontend
npx nx serve portfolio

# Start backend
npx nx serve portfolio-api

# Both will be available at:
# Frontend: http://localhost:4200
# Backend: http://localhost:3000
```

### API Endpoints:
- `GET /api/health` - Health check
- `GET /api/projects` - Get portfolio projects
- `GET /api/skills` - Get skills data
- `POST /api/contact` - Submit contact form
- `GET /api/docs` - Interactive API documentation (Swagger UI)

### Deployment:
```bash
# SSH to server
ssh portfolio@your-droplet-ip

# Navigate to project
cd /var/www/portfolio

# Run deployment script
./deploy.sh
```

## Monitoring

### Check Backend Status:
```bash
pm2 status
pm2 logs portfolio-api
```

### Check Nginx Status:
```bash
sudo systemctl status nginx
sudo nginx -t
```

### View Logs:
```bash
# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Backend logs
pm2 logs portfolio-api
```

## Troubleshooting

### Common Issues:

1. **Port 3000 already in use**:
   ```bash
   sudo lsof -ti:3000 | xargs sudo kill -9
   pm2 restart portfolio-api
   ```

2. **Nginx configuration error**:
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

3. **SSL certificate issues**:
   ```bash
   sudo certbot renew
   sudo systemctl reload nginx
   ```

4. **Backend not responding**:
   ```bash
   pm2 restart portfolio-api
   pm2 logs portfolio-api
   ```

## Performance Optimization

### Enable Gzip compression in nginx (already in config above)
### Use PM2 clustering for better performance:
```javascript
// In ecosystem.config.js
instances: 'max', // Use all CPU cores
exec_mode: 'cluster'
```

### Setup monitoring:
```bash
# Install PM2 monitoring
pm2 install pm2-server-monit
```

## Security Best Practices

1. **Regular updates**:
   ```bash
   sudo apt update && sudo apt upgrade
   ```

2. **Firewall rules**:
   ```bash
   sudo ufw status
   ```

3. **SSL certificate auto-renewal**:
   ```bash
   sudo crontab -e
   # Add: 0 12 * * * /usr/bin/certbot renew --quiet
   ```

4. **Regular backups**:
   ```bash
   # Backup application
   tar -czf portfolio-backup-$(date +%Y%m%d).tar.gz /var/www/portfolio
   ```

## Cost Optimization

- **Basic Droplet**: $12/month for 2GB RAM
- **DNS**: Free with DigitalOcean
- **SSL**: Free with Let's Encrypt
- **Total**: ~$12/month

This setup provides a robust, scalable deployment for your portfolio with both frontend and backend running efficiently on a single DigitalOcean droplet.

If you have a domain name:

1. Point your domain's A record to your droplet's IP
2. Update the nginx configuration:
   ```bash
   sudo nano /etc/nginx/sites-available/portfolio
   ```
3. Replace `your-domain.com` with your actual domain
4. Set up SSL with Let's Encrypt:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

### 6. Test Deployment

1. Push changes to the `master` branch
2. Check GitHub Actions for deployment status
3. Visit your droplet's IP or domain to see the deployed site

## Deployment Process

The CI/CD pipeline will:

1. **Build**: 
   - Install dependencies
   - Run linting and tests
   - Build the Angular app for production
   - Upload build artifacts

2. **Deploy** (only on master branch):
   - Download build artifacts
   - SSH into the droplet
   - Backup current deployment
   - Copy new files
   - Restart nginx
   - Verify deployment

## Troubleshooting

### Check nginx status
```bash
sudo systemctl status nginx
sudo nginx -t  # Test configuration
```

### Check nginx logs
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Check deployment logs
```bash
ls -la /var/www/portfolio/
```

### Manual deployment
```bash
# If automatic deployment fails, you can deploy manually:
scp -r dist/* root@YOUR_DROPLET_IP:/var/www/portfolio/current/
```

### Port already in use
If you get a port 80 error, check what's using it:
```bash
sudo netstat -tulpn | grep :80
sudo systemctl stop apache2  # If Apache is running
```

## Security Considerations

1. **SSH Key Security**: Use a dedicated SSH key for GitHub Actions
2. **Firewall**: Only allow necessary ports (22, 80, 443)
3. **SSL**: Always use HTTPS in production
4. **Regular Updates**: Keep the server updated
5. **Backup**: Regular backups of your deployment

## Performance Optimization

1. **Gzip Compression**: Enabled in nginx config
2. **Static Asset Caching**: Long-term caching for assets
3. **HTTP/2**: Enable with SSL certificate
4. **CDN**: Consider using DigitalOcean Spaces + CDN for static assets
