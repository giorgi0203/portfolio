# Portfolio Deployment Guide

## DigitalOcean Droplet Setup

### 1. Create a DigitalOcean Droplet

1. Create a new Ubuntu 22.04 droplet on DigitalOcean
2. Choose appropriate size (Basic plan with 1GB RAM should be sufficient)
3. Add your SSH key for access
4. Note down the droplet's IP address

### 2. Server Setup

Run the setup script on your droplet:

```bash
# SSH into your droplet
ssh root@YOUR_DROPLET_IP

# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/portfolio/master/scripts/setup-server.sh | bash

# Or copy the script manually and run it
chmod +x setup-server.sh
./setup-server.sh
```

### 3. Configure GitHub Secrets

Add the following secrets to your GitHub repository (Settings > Secrets and variables > Actions):

- `DROPLET_HOST`: Your droplet's IP address
- `DROPLET_USERNAME`: SSH username (usually `root`)
- `DROPLET_SSH_KEY`: Your private SSH key (see instructions below)
- `DROPLET_PORT`: SSH port (22 by default)

### 4. Generate SSH Key for GitHub Actions

On your droplet, generate a dedicated SSH key for GitHub Actions:

```bash
# Generate SSH key
ssh-keygen -t rsa -b 4096 -f ~/.ssh/github_actions

# Add public key to authorized_keys
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# Display private key (copy this to GitHub secrets)
cat ~/.ssh/github_actions
```

### 5. Configure Domain (Optional)

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
