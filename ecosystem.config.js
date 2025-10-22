module.exports = {
  apps: [
    {
      name: 'portfolio-api',
      script: './main.js',
      cwd: '/var/www/portfolio-api',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Add production-specific environment variables
        API_BASE_URL: 'https://giorgi.app/api',
        CORS_ORIGIN: 'https://giorgi.app',
      },
      // PM2 monitoring and restart options
      max_memory_restart: '500M',
      error_file: '/var/log/pm2/portfolio-api-error.log',
      out_file: '/var/log/pm2/portfolio-api-out.log',
      log_file: '/var/log/pm2/portfolio-api.log',
      time: true,
      
      // Auto restart on crash
      autorestart: true,
      watch: false,
      
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Health check
      min_uptime: '10s',
      max_restarts: 10,
    }
  ]
};