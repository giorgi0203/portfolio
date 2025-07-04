#!/bin/bash

# DigitalOcean Droplet Setup Script for Portfolio Deployment
# Run this script on your DigitalOcean droplet to set up the server

set -e

echo "🚀 Setting up DigitalOcean droplet for portfolio deployment..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y nginx curl ufw git

# Configure firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# Create deployment directories
sudo mkdir -p /var/www/portfolio/current
sudo mkdir -p /var/www/portfolio/backup

# Set up nginx configuration
sudo tee /etc/nginx/sites-available/portfolio > /dev/null <<EOF
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    root /var/www/portfolio/current;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private no_last_modified no_etag auth;
    gzip_types
        application/atom+xml
        application/javascript
        application/json
        application/rss+xml
        application/vnd.ms-fontobject
        application/x-font-ttf
        application/x-web-app-manifest+json
        application/xhtml+xml
        application/xml
        font/opentype
        image/svg+xml
        image/x-icon
        text/css
        text/plain
        text/x-component;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Handle Angular routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Security
    location ~ /\. {
        deny all;
    }
}
EOF

# Enable the site
sudo ln -sf /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Start and enable nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Set proper permissions
sudo chown -R www-data:www-data /var/www/portfolio
sudo chmod -R 755 /var/www/portfolio

echo "✅ Server setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Add your domain to the nginx configuration: /etc/nginx/sites-available/portfolio"
echo "2. Set up SSL with Let's Encrypt: sudo certbot --nginx -d your-domain.com"
echo "3. Configure GitHub secrets in your repository:"
echo "   - DROPLET_HOST: Your droplet's IP address"
echo "   - DROPLET_USERNAME: Your SSH username (usually root)"
echo "   - DROPLET_SSH_KEY: Your private SSH key"
echo "   - DROPLET_PORT: SSH port (22 by default)"
echo ""
echo "🔐 To generate SSH key for GitHub Actions:"
echo "   ssh-keygen -t rsa -b 4096 -f ~/.ssh/github_actions"
echo "   cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys"
echo "   cat ~/.ssh/github_actions  # Copy this private key to GitHub secrets"
