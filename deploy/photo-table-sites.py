"""Render the two new host configurations and add the bounded receipt upload route."""
from pathlib import Path
import sys
release, backup = map(Path, sys.argv[1:])
sites = Path('/etc/nginx/sites-available')
decision = (backup/'decisions.conf').read_text()
if 'location = /api/receipt/analyze ' not in decision:
    anchor = 'location = /api/menu/analyze '
    lines = decision.splitlines(keepends=True)
    matching = [line for line in lines if line.lstrip().startswith(anchor)]
    if len(matching) != 1 or 'client_max_body_size 3m;' not in matching[0] or 'proxy_pass' not in matching[0]:
        raise SystemExit('Unable to identify the existing Decision photo upload location')
    decision = decision.replace(matching[0], matching[0] + matching[0].replace(anchor, 'location = /api/receipt/analyze ', 1))
(sites/'giorgi-decisions').write_text(decision)
for name in ['same-frame', 'split-supra']:
    host = name + '.giorgi.app'
    connections = "'self'" + (" https://decisions.giorgi.app" if name=='split-supra' else '')
    routes = '''
    location ^~ /table/ { access_log off; try_files $uri /index.html; }
    location ^~ /api/supra/ {
        access_log off;
        limit_req zone=giorgi_decisions burst=30 nodelay;
        limit_req_status 429;
        client_max_body_size 40k;
        proxy_pass http://127.0.0.1:3360;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
''' if name=='split-supra' else ''
    robots = 'add_header X-Robots-Tag $supra_robots always;' if name=='split-supra' else ''
    variables = 'map $request_uri $supra_robots { default "noindex, nofollow"; "/" "index, follow"; }' if name=='split-supra' else ''
    conf = f"""{variables}
server {{
    listen 80; listen [::]:80; server_name {host};
    location /.well-known/acme-challenge/ {{ root /var/www/giorgi-photo-table-acme; }}
    location / {{ return 301 https://{host}$request_uri; }}
}}
server {{
    listen 443 ssl; listen [::]:443 ssl; server_name {host};
    ssl_certificate /etc/letsencrypt/live/giorgi-photo-table/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/giorgi-photo-table/privkey.pem;
    root {release}/{name};
    expires -1;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy no-referrer always;
    add_header Cache-Control no-store always;
    add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; font-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src {connections}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'" always;
    {robots}
    {routes}
    location /api/ {{ return 404; }}
    location /assets/ {{ try_files $uri =404; }}
    location / {{ try_files $uri $uri/ =404; }}
}}
"""
    (sites/('giorgi-'+name)).write_text(conf)
