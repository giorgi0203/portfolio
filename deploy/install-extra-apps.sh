#!/usr/bin/env bash
set -euo pipefail
[[ ! -f /etc/giorgi-extras/mcp-disabled ]] || { echo 'The legacy stack includes disabled MCP demos. Use a deployment for the active compiler/API services.' >&2; exit 1; }
stage=${1:?staging directory required}
release_id=${2:?source SHA required}
[[ $release_id =~ ^[a-f0-9]{40}$ && $stage =~ ^/var/tmp/giorgi-extra-[a-f0-9]{40}$ ]]
ip -4 -o addr show | grep '138.68.64.163/' >/dev/null
node=/opt/smart-todo-node-24.22.1/bin/node
[[ -x $node && -f $stage/apps/compiler/main.js && -f $stage/apps/ui/index.html ]]
target=/var/www/giorgi-extras
release=$target/releases/$release_id-$(date -u +%Y%m%dT%H%M%S)-$$
backup=/var/backups/giorgi-extras/$release_id-$(date -u +%Y%m%dT%H%M%S)
install -d -m 755 "$target/releases" /var/www/giorgi-labs-acme
install -d -m 700 "$backup"
previous=$(readlink "$target/current" || true)
services=(giorgi-compiler giorgi-example-mcp giorgi-mcp-gateway giorgi-catalog-api)
sites=(giorgi-angular-compiler giorgi-example-mcp giorgi-mcp-gateway giorgi-catalog-api)
for name in "${services[@]}"; do
  [[ ! -f /etc/systemd/system/$name.service ]] || cp -p "/etc/systemd/system/$name.service" "$backup/"
done
for name in "${sites[@]}"; do
  [[ ! -f /etc/nginx/sites-available/$name ]] || cp -p "/etc/nginx/sites-available/$name" "$backup/"
done
rollback() {
  if [[ -n $previous ]]; then ln -sfn "$previous" "$target/current"; else rm -f "$target/current"; fi
  for name in "${services[@]}"; do
    if [[ -f $backup/$name.service ]]; then cp -p "$backup/$name.service" "/etc/systemd/system/$name.service";
    else systemctl disable --now "$name" >/dev/null 2>&1 || true; rm -f "/etc/systemd/system/$name.service"; fi
  done
  for name in "${sites[@]}"; do
    if [[ -f $backup/$name ]]; then cp -p "$backup/$name" "/etc/nginx/sites-available/$name";
    else rm -f "/etc/nginx/sites-enabled/$name" "/etc/nginx/sites-available/$name"; fi
  done
  systemctl daemon-reload
  if [[ -n $previous ]]; then systemctl restart "${services[@]}"; fi
  nginx -t && systemctl reload nginx
}
finish() { result=$?; trap - EXIT; if ((result!=0)); then rollback || true; fi; rm -rf -- "$stage"; exit "$result"; }
trap finish EXIT
[[ ! -e $release ]]
install -d -m 755 "$release"
cp -a "$stage/apps/." "$release/"
chmod -R a+rX "$release"
for user in giorgi-labs giorgi-compiler; do
  id "$user" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$user"
done
install -d -o giorgi-compiler -g giorgi-compiler -m 700 /var/lib/giorgi-compiler /var/lib/giorgi-compiler/tmp
ln -sfn "$release" "$target/current"

python3 - "$target/current" "$node" <<'PYUNITS'
from pathlib import Path
import sys
root,node=sys.argv[1:]
services=[
 ('giorgi-compiler','compiler','3301','giorgi-compiler',f'{node} main.js',320,['COMPILER_NODE_MODULES='+root+'/compiler/node_modules','TMPDIR=/var/lib/giorgi-compiler/tmp']),
 ('giorgi-example-mcp','example','3331','giorgi-labs',f'{node} main.js --http 3331',80,['WORKSPACE_METADATA_DIR='+root+'/metadata']),
 ('giorgi-mcp-gateway','gateway','3340','giorgi-labs',f'{node} main.js',64,['MCP_GATEWAY_PORT=3340','EXAMPLE_MCP_URL=http://127.0.0.1:3331']),
 ('giorgi-catalog-api','api','3320','giorgi-labs',f'{node} main.js',80,['PUBLIC_URL=https://api.giorgi.app','SWAGGER_ASSETS_PATH='+root+'/swagger']),
]
for name,directory,port,user,command,memory,extra in services:
 env=['NODE_ENV=production','HOST=127.0.0.1','PORT='+port]+extra
 settings='\n'.join('Environment='+v for v in env)
 writable='ReadWritePaths=/var/lib/giorgi-compiler\n' if user=='giorgi-compiler' else ''
 Path('/etc/systemd/system/'+name+'.service').write_text(f'''[Unit]
Description=Giorgi experiment: {name}
After=network.target
[Service]
User={user}
Group={user}
WorkingDirectory={root}/{directory}
ExecStart={command}
{settings}
Restart=on-failure
RestartSec=5
MemoryMax={memory}M
TasksMax=64
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
{writable}[Install]
WantedBy=multi-user.target
''')
PYUNITS
systemctl daemon-reload
systemctl enable --now "${services[@]}"
systemctl restart "${services[@]}"
for entry in '3301 /health' '3331 /health' '3340 /health' '3320 /api/health'; do
  read -r port health <<< "$entry"
  ready=false
  for attempt in {1..15}; do
    if curl -fsS --max-time 4 "http://127.0.0.1:$port$health" >/dev/null; then ready=true; break; fi
    sleep 1
  done
  $ready
done

# New hosts have separate vhosts; existing portfolio, HLS and Smart Todo configs stay in place.
python3 - <<'PYHTTP'
from pathlib import Path
for name,host in [('giorgi-angular-compiler','angular-compiler'),('giorgi-example-mcp','example-mcp'),('giorgi-mcp-gateway','mcp'),('giorgi-catalog-api','api')]:
 p=Path('/etc/nginx/sites-available')/name
 if not p.exists():p.write_text(f'server {{ listen 80; listen [::]:80; server_name {host}.giorgi.app; location /.well-known/acme-challenge/ {{ root /var/www/giorgi-labs-acme; }} location / {{ return 301 https://{host}.giorgi.app$request_uri; }} }}\n')
 link=Path('/etc/nginx/sites-enabled')/name
 if not link.is_symlink():link.symlink_to(p)
PYHTTP
nginx -t
systemctl reload nginx
if [[ ! -f /etc/letsencrypt/live/angular-compiler.giorgi.app/fullchain.pem ]]; then
  certbot certonly --webroot -w /var/www/giorgi-labs-acme --cert-name angular-compiler.giorgi.app \
    -d angular-compiler.giorgi.app -d example-mcp.giorgi.app -d mcp.giorgi.app -d api.giorgi.app --non-interactive --agree-tos
fi
python3 - "$target/current" <<'PYSITES'
from pathlib import Path
import sys
root=sys.argv[1]
Path('/etc/nginx/conf.d/giorgi-labs-limits.conf').write_text('limit_req_zone $binary_remote_addr zone=giorgi_compile:1m rate=10r/m;\nlimit_req_zone $binary_remote_addr zone=giorgi_labs:1m rate=10r/s;\n')
for name,host,port in [('giorgi-angular-compiler','angular-compiler',3301),('giorgi-example-mcp','example-mcp',3331),('giorgi-mcp-gateway','mcp',3340),('giorgi-catalog-api','api',3320)]:
 proxy=f'''proxy_pass http://127.0.0.1:{port}; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_read_timeout 60s;'''
 if host=='angular-compiler':
  locations=f'''root {root}/ui;
 location = /health {{ {proxy} }}
 location /api/ {{ limit_req zone=giorgi_compile burst=5 nodelay; limit_req_status 429; {proxy} }}
 location / {{ try_files $uri $uri/ /index.html; }}'''
 else:locations=f'location / {{ limit_req zone=giorgi_labs burst=40 nodelay; limit_req_status 429; {proxy} }}'
 config=f'''server {{
 listen 80; listen [::]:80; server_name {host}.giorgi.app;
 location /.well-known/acme-challenge/ {{ root /var/www/giorgi-labs-acme; }}
 location / {{ return 301 https://{host}.giorgi.app$request_uri; }}
}}
server {{
 listen 443 ssl; listen [::]:443 ssl; server_name {host}.giorgi.app;
 ssl_certificate /etc/letsencrypt/live/angular-compiler.giorgi.app/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/angular-compiler.giorgi.app/privkey.pem;
 client_max_body_size 220k;
 location = /api/analytics/event {{ proxy_pass http://127.0.0.1:3100; proxy_set_header Host auth.giorgi.app; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; }}
 add_header X-Content-Type-Options nosniff always;
 add_header Referrer-Policy strict-origin-when-cross-origin always;
 add_header Content-Security-Policy "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" always;
 {locations}
}}
'''
 (Path('/etc/nginx/sites-available')/name).write_text(config)
PYSITES
nginx -t
systemctl reload nginx
COMPILER_URL=https://angular-compiler.giorgi.app EXAMPLE_URL=https://example-mcp.giorgi.app GATEWAY_URL=https://mcp.giorgi.app CATALOG_URL=https://api.giorgi.app SMOKE_ONLY=1 "$node" "$stage/scripts/check-extra-services.cjs"
for host in giorgi.app www.giorgi.app hls-player.giorgi.app smart-todolist.giorgi.app auth.giorgi.app; do
  curl -fsS --max-time 15 "https://$host/" >/dev/null
done
systemctl show "${services[@]}" -p Id -p ActiveState -p NRestarts -p MemoryCurrent
free -m
echo "Extra apps release $release_id is healthy. Rollback backup: $backup"
