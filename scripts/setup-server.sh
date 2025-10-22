#!/bin/bash
set -e

echo "🌟 Setting up Portfolio Server on DigitalOcean..."

# Update system
echo "� Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs

# Install nginx
echo "📦 Installing Nginx..."
apt install nginx -y

# Install PM2 for process management
echo "📦 Installing PM2..."
npm install -g pm2

# Install certbot for SSL
echo "📦 Installing Certbot for SSL..."
apt install certbot python3-certbot-nginx -y

# Install git
echo "📦 Installing Git..."
apt install git -y

# Create application user
echo "👤 Creating portfolio user..."
useradd -m -s /bin/bash portfolio || echo "User already exists"
usermod -aG sudo portfolio

# Create application directory
echo "📁 Setting up application directory..."
mkdir -p /var/www/portfolio
chown portfolio:portfolio /var/www/portfolio

# Setup firewall
echo "🔥 Configuring firewall..."
ufw --force enable
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS

# Start and enable services
echo "🚀 Starting services..."
systemctl start nginx
systemctl enable nginx

echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "1. Switch to portfolio user: su - portfolio"
echo "2. Navigate to app directory: cd /var/www/portfolio"
echo "3. Clone your repository: git clone https://github.com/giorgi0203/portfolio.git ."
echo "4. Install dependencies: npm install"
echo "5. Follow the deployment guide to configure Nginx and PM2"
echo ""
echo "Remember to:"
echo "- Configure your domain DNS records"
echo "- Setup SSL certificates with certbot"
echo "- Configure nginx virtual host for your domain"
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
