#!/usr/bin/env bash
set -euo pipefail
stage=${1:?disk stage required}; source_id=${2:?source SHA required}
[[ $stage =~ ^/var/tmp/giorgi-products-[a-f0-9]{40}$ && $source_id =~ ^[a-f0-9]{40}$ ]]
ip -4 -o addr show | grep '138.68.64.163/' >/dev/null
node=/opt/smart-todo-node-24.22.1/bin/node
[[ -x $node && -s $stage/products/lab/index.html && -s $stage/products/health/server/server.mjs && -f /etc/giorgi-extras/mcp-disabled ]]
base=/var/www/giorgi-products; release=$base/releases/$source_id-$(date -u +%Y%m%dT%H%M%S)-$$
backup=/var/backups/giorgi-products/$(date -u +%Y%m%dT%H%M%S)-$$
install -d -m 755 "$release" /var/www/giorgi-products-acme
install -d -m 700 "$backup"
services=(giorgi-compiler giorgi-health giorgi-learning)
sites=(giorgi-angular-compiler giorgi-toolbox giorgi-health)
previous=$(readlink "$base/current" || true); hls_previous=$(readlink /var/www/hls-player/current)
for name in "${services[@]}"; do [[ ! -f /etc/systemd/system/$name.service ]] || cp -p "/etc/systemd/system/$name.service" "$backup/"; done
for name in "${sites[@]}"; do [[ ! -f /etc/nginx/sites-available/$name ]] || cp -p "/etc/nginx/sites-available/$name" "$backup/"; done
rollback(){
 if [[ -n $previous ]]; then ln -sfn "$previous" "$base/current"; else rm -f "$base/current"; fi
 ln -sfn "$hls_previous" /var/www/hls-player/current
 for name in "${services[@]}"; do
  if [[ -f $backup/$name.service ]];then cp -p "$backup/$name.service" "/etc/systemd/system/$name.service";
  else systemctl disable --now "$name" >/dev/null 2>&1 || true;rm -f "/etc/systemd/system/$name.service";fi
 done
 for name in "${sites[@]}";do
  if [[ -f $backup/$name ]];then cp -p "$backup/$name" "/etc/nginx/sites-available/$name";
  else rm -f "/etc/nginx/sites-enabled/$name" "/etc/nginx/sites-available/$name";fi
 done
 systemctl daemon-reload
 for name in "${services[@]}";do [[ ! -f $backup/$name.service ]] || systemctl restart "$name";done
 nginx -t && systemctl reload nginx
}
finish(){ result=$?;trap - EXIT;if ((result!=0));then rollback || true;fi;rm -rf -- "$stage";exit "$result"; }
trap finish EXIT
# The small droplet needs room for compiler/auth memory spikes; use disk-backed swap.
if [[ $(awk '/SwapTotal/{print $2}' /proc/meminfo) == 0 ]];then
 [[ $(df --output=avail -B1 /var | tail -1) -gt 2147483648 ]]
 if [[ ! -f /var/swap.giorgi ]];then fallocate -l 1G /var/swap.giorgi;chmod 600 /var/swap.giorgi;mkswap /var/swap.giorgi;fi
 swapon /var/swap.giorgi
 grep -F '/var/swap.giorgi ' /etc/fstab >/dev/null || printf '/var/swap.giorgi none swap sw 0 0\n' >> /etc/fstab
fi
cp -a "$stage/products/." "$release/";chmod -R a+rX "$release"
ln -sfn "$release" "$base/current"
ln -sfn "$release/hls" /var/www/hls-player/current
id giorgi-health >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin giorgi-health
install -d -o giorgi-health -g giorgi-health -m 700 /var/lib/giorgi-health
python3 - "$base/current" "$node" "$source_id" <<'PYUNITS'
from pathlib import Path
import sys
root,node,source=sys.argv[1:]
# Preserve the proven compiler unit's user and temp-directory restrictions.
p=Path('/etc/systemd/system/giorgi-compiler.service');s=p.read_text();import re
s=re.sub(r'WorkingDirectory=.*',f'WorkingDirectory={root}/compiler',s)
s=re.sub(r'Environment=COMPILER_NODE_MODULES=.*',f'Environment=COMPILER_NODE_MODULES={root}/compiler/node_modules',s);p.write_text(s)
for name,user,cwd,command,env,memory,writable in [
 ('giorgi-health','giorgi-health',root+'/health',node+' server/server.mjs',['HOST=127.0.0.1','PORT=3350','HEALTH_DATA_DIR=/var/lib/giorgi-health','HEALTH_RELEASE='+source[:12]],112,'/var/lib/giorgi-health'),
 ('giorgi-learning','www-data','/var/www/giorgi-identity/current',node+' server.js',['HOSTNAME=127.0.0.1','PORT=3150','APP_ROLE=learning','APP_URL=https://angular-compiler.giorgi.app','AUTH_PUBLIC_URL=https://auth.giorgi.app','AUTH_INTERNAL_URL=http://127.0.0.1:3100','DATABASE_PATH=/var/lib/smart-todolist/workspace.sqlite','NEXT_TELEMETRY_DISABLED=1'],140,'/var/lib/smart-todolist')]:
 settings='\n'.join('Environment='+v for v in ['NODE_ENV=production']+env)
 Path('/etc/systemd/system/'+name+'.service').write_text(f'''[Unit]
Description=Giorgi product: {name}
After=network.target
[Service]
User={user}
Group={user}
WorkingDirectory={cwd}
ExecStart={command}
{settings}
Restart=on-failure
RestartSec=5
MemoryMax={memory}M
TasksMax=64
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths={writable}
UMask=0077
[Install]
WantedBy=multi-user.target
''')
PYUNITS
# New hosts: ACME only until their certificate is installed.
for name in toolbox status;do
 file=giorgi-toolbox;[[ $name != status ]] || file=giorgi-health
 if [[ ! -f /etc/nginx/sites-available/$file ]];then
  printf 'server {listen 80;listen [::]:80;server_name %s.giorgi.app;location /.well-known/acme-challenge/ {root /var/www/giorgi-products-acme;}location / {return 503;}}\n' "$name" > "/etc/nginx/sites-available/$file"
  ln -sfn "/etc/nginx/sites-available/$file" "/etc/nginx/sites-enabled/$file"
 fi
done
nginx -t;systemctl reload nginx
if [[ ! -f /etc/letsencrypt/live/toolbox.giorgi.app/fullchain.pem ]];then
 certbot certonly --webroot -w /var/www/giorgi-products-acme --cert-name toolbox.giorgi.app -d toolbox.giorgi.app -d status.giorgi.app --non-interactive --agree-tos
fi
python3 - "$base/current" <<'PYSITES'
from pathlib import Path
import sys
root=sys.argv[1]
def proxy(port):return f'proxy_pass http://127.0.0.1:{port};proxy_http_version 1.1;proxy_set_header Host $host;proxy_set_header X-Real-IP $remote_addr;proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;proxy_set_header X-Forwarded-Proto $scheme;proxy_buffering off;proxy_read_timeout 25s;'
for name,host,certificate in [('giorgi-angular-compiler','angular-compiler','angular-compiler'),('giorgi-toolbox','toolbox','toolbox'),('giorgi-health','status','toolbox')]:
 locations='location = /api/analytics/event {'+proxy(3100)+'}'
 if host=='angular-compiler':
  locations+='location = /health {'+proxy(3301)+'}location = /api/compile {limit_req zone=giorgi_compile burst=5 nodelay;limit_req_status 429;'+proxy(3301)+'}location /api/auth/ {'+proxy(3150)+'}location /api/learning/ {'+proxy(3150)+'}location /api/ {return 404;}location / {try_files $uri $uri/ /index.html;}'
  directory=root+'/lab'
 elif host=='toolbox':directory=root+'/toolbox';locations+='location / {try_files $uri $uri/ /index.html;}'
 else:directory=root+'/health/public';locations+='location /api/ {limit_req zone=giorgi_labs burst=20 nodelay;limit_req_status 429;'+proxy(3350)+'}location = /health {'+proxy(3350)+'}location / {try_files $uri $uri/ /index.html;}'
 acme='/var/www/giorgi-labs-acme' if host=='angular-compiler' else '/var/www/giorgi-products-acme'
 content=f'''server {{listen 80;listen [::]:80;server_name {host}.giorgi.app;location /.well-known/acme-challenge/ {{root {acme};}}location / {{return 301 https://{host}.giorgi.app$request_uri;}}}}
server {{listen 443 ssl;listen [::]:443 ssl;server_name {host}.giorgi.app;
ssl_certificate /etc/letsencrypt/live/{certificate}.giorgi.app/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/{certificate}.giorgi.app/privkey.pem;
root {directory};client_max_body_size 220k;
add_header X-Content-Type-Options nosniff always;add_header Referrer-Policy strict-origin-when-cross-origin always;
add_header Content-Security-Policy "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" always;
{locations}
}}
'''
 target=Path('/etc/nginx/sites-available')/name;temp=target.with_suffix('.next');temp.write_text(content);temp.replace(target)
PYSITES
systemctl daemon-reload
systemctl enable --now "${services[@]}"
systemctl restart "${services[@]}"
for entry in '3301 /health' '3350 /health' '3150 /api/health';do
 read -r port path <<< "$entry"; ready=false
 for attempt in {1..20};do if curl -fsS --max-time 3 "http://127.0.0.1:$port$path" >/dev/null;then ready=true;break;fi;sleep 1;done
 $ready
done
nginx -t;systemctl reload nginx
"$node" "$stage/tests/verify-learning-accounts.mjs"
for host in angular-compiler toolbox status hls-player;do curl -fsS --max-time 20 "https://$host.giorgi.app/" >/dev/null;done
for host in example-mcp mcp;do [[ $(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "https://$host.giorgi.app/") == 410 ]];done
! systemctl is-active --quiet giorgi-example-mcp
! systemctl is-active --quiet giorgi-mcp-gateway
systemctl show "${services[@]}" -p Id -p ActiveState -p NRestarts -p MemoryCurrent
free -m
echo "PASS active products healthy; retired MCP services stay disabled. Backup: $backup"
