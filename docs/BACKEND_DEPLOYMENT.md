# Backend Deployment Guide

This guide covers the automated deployment of the NestJS backend API to DigitalOcean using GitHub Actions.

## 🚀 Deployment Workflow

### Automatic Deployment
The backend automatically deploys when:
- Code is pushed to `main` branch
- Changes are made to:
  - `apps/portfolio-api/**`
  - `libs/shared-types/**`
  - `.github/workflows/backend-deploy.yml`

### Manual Deployment
Trigger manually via:
- GitHub Actions UI → "Deploy Backend to DigitalOcean" → "Run workflow"
- Local deployment: `npm run deploy:backend`

## 🔧 Deployment Pipeline

### 1. **Test Phase**
```bash
# Run tests for shared types and backend
nx test shared-types
nx lint portfolio-api
nx test portfolio-api
nx e2e portfolio-api-e2e
```

### 2. **Build Phase**
```bash
# Build production artifacts
nx build shared-types
nx build portfolio-api --configuration=production
```

### 3. **Deploy Phase**
```bash
# Package and deploy to DigitalOcean
# - Create backup of current version
# - Deploy new version
# - Install dependencies
# - Restart PM2 process
# - Run health checks
```

## 🛠️ Server Configuration

### PM2 Process Management
```bash
# Check status
pm2 status
pm2 logs portfolio-api

# Manual restart
pm2 restart portfolio-api

# Monitor
pm2 monit
```

### Log Files
```bash
# Application logs
tail -f /var/log/pm2/portfolio-api.log

# Error logs
tail -f /var/log/pm2/portfolio-api-error.log

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 🔐 Required GitHub Secrets

Set these in your GitHub repository settings (same as frontend):

```
DROPLET_HOST=your-server-ip
DROPLET_USERNAME=your-username
DROPLET_SSH_KEY=your-private-ssh-key
DROPLET_SSH_PASSPHRASE=your-ssh-passphrase (if needed)
```

**Note**: These are the same secrets used by the frontend deployment, so they should already be configured.

## 🚦 Health Checks

### Automated Checks
- **Build Health**: Runs during deployment
- **API Health**: `GET /api/health`
- **Service Health**: PM2 process monitoring

### Manual Verification
```bash
# Test API endpoints
curl https://giorgi.app/api/health
curl https://giorgi.app/api/projects
curl https://giorgi.app/api/skills

# View API documentation
# Visit: https://giorgi.app/api/docs
```

## 🔄 Rollback Process

### Automatic Rollback
- Triggers if health check fails
- Restores previous backup
- Restarts services

### Manual Rollback
```bash
# List available backups
ls -la /var/www/portfolio-api-backup-*

# Restore specific backup
sudo cp -r /var/www/portfolio-api-backup-YYYYMMDD-HHMMSS /var/www/portfolio-api
pm2 restart portfolio-api
```

## 📊 Monitoring

### Performance Monitoring
```bash
# PM2 monitoring
pm2 monit

# System resources
htop
df -h
free -h
```

### Application Metrics
- **Memory Usage**: Max 500MB (auto-restart)
- **Uptime**: Minimum 10s before considering stable
- **Max Restarts**: 10 per hour
- **Response Time**: < 500ms for health check

## 🔧 Troubleshooting

### Common Issues

**Port Already in Use**
```bash
sudo lsof -i :3000
pm2 delete portfolio-api
pm2 start ecosystem.config.js --env production
```

**Permission Issues**
```bash
sudo chown -R www-data:www-data /var/www/portfolio-api
sudo chmod -R 755 /var/www/portfolio-api
```

**SSL Certificate Issues**
```bash
sudo certbot renew
sudo nginx -t
sudo systemctl reload nginx
```

### Debug Mode
```bash
# Run in debug mode
NODE_ENV=development pm2 start ecosystem.config.js

# View detailed logs
pm2 logs portfolio-api --lines 100
```

## 📈 Performance Optimization

### Production Settings
- **Clustering**: Single instance (suitable for small VPS)
- **Memory Limit**: 500MB auto-restart
- **Log Rotation**: Automatic via PM2
- **Graceful Shutdown**: 5s timeout

### Scaling Options
```bash
# Scale to multiple instances
pm2 scale portfolio-api 2

# Auto-scaling based on load
pm2 start ecosystem.config.js --instances max
```

## 🔗 Related Documentation

- [Main Deployment Guide](../DEPLOYMENT.md)
- [Frontend Deployment](./FRONTEND_DEPLOYMENT.md)
- [API Documentation](https://giorgi.app/api/docs)
- [Nx Workspace Guide](../README.md)