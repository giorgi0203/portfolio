#!/usr/bin/env bash
# Scoped release: only the HTTP Playground and Decision Department hosts/service.
set -euo pipefail
stage=${1:?staging directory required}; release_id=${2:?source SHA required}
[[ $release_id =~ ^[a-f0-9]{40}$ && $stage == "/var/tmp/giorgi-fun-$release_id" ]]
ip -4 -o addr show | grep '138.68.64.163/' >/dev/null
node=/opt/smart-todo-node-24.22.1/bin/node
[[ -x $node && -s $stage/apps/http-playground/index.html && -s $stage/apps/decision-department/public/index.html && -s $stage/apps/decision-department/server/server.mjs ]]
nginx -t
if [[ ! -f /etc/systemd/system/giorgi-decisions.service ]] && ss -ltn | grep ':3360 ' >/dev/null; then echo 'Port 3360 is already occupied' >&2; exit 1; fi
base=/var/www/giorgi-fun-apps
release=$base/releases/$release_id-$(date -u +%Y%m%dT%H%M%S)-$$
backup=/var/backups/giorgi-fun-apps/$(date -u +%Y%m%dT%H%M%S)-$$
install -d -m 755 "$release" /var/www/giorgi-fun-acme
install -d -m 700 "$backup"
previous=$(readlink "$base/current" || true)
for file in /etc/systemd/system/giorgi-decisions.service /etc/nginx/sites-available/giorgi-http-playground /etc/nginx/sites-available/giorgi-decisions /etc/nginx/conf.d/giorgi-decisions.conf; do
 if [[ -f $file ]];then cp -p "$file" "$backup/$(basename "$file")";fi
done
rollback(){
 if [[ -n $previous ]];then ln -sfn "$previous" "$base/current";else rm -f "$base/current";fi
 for name in giorgi-http-playground giorgi-decisions;do
  if [[ -f $backup/$name ]];then cp -p "$backup/$name" "/etc/nginx/sites-available/$name";
  else rm -f "/etc/nginx/sites-enabled/$name" "/etc/nginx/sites-available/$name";fi
 done
 if [[ -f $backup/giorgi-decisions.conf ]];then cp -p "$backup/giorgi-decisions.conf" /etc/nginx/conf.d/giorgi-decisions.conf;else rm -f /etc/nginx/conf.d/giorgi-decisions.conf;fi
 if [[ -f $backup/giorgi-decisions.service ]];then cp -p "$backup/giorgi-decisions.service" /etc/systemd/system/giorgi-decisions.service;systemctl daemon-reload;systemctl restart giorgi-decisions;
 else systemctl disable --now giorgi-decisions 2>/dev/null || true;rm -f /etc/systemd/system/giorgi-decisions.service;systemctl daemon-reload;fi
 nginx -t && systemctl reload nginx
}
finish(){ result=$?;trap - EXIT;if ((result!=0));then rollback || true;fi;rm -rf -- "$stage";exit "$result"; }
trap finish EXIT
cp -a "$stage/apps/." "$release/";chmod -R a+rX "$release"
ln -sfn "$release" "$base/current"
id giorgi-decisions >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin giorgi-decisions
install -d -o giorgi-decisions -g giorgi-decisions -m 700 /var/lib/giorgi-decisions
cat > /etc/systemd/system/giorgi-decisions.service <<UNIT
[Unit]
Description=Giorgi Decision Department shared rooms
After=network.target
[Service]
User=giorgi-decisions
Group=giorgi-decisions
WorkingDirectory=$base/current/decision-department
ExecStart=$node server/server.mjs
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3360
Environment=APP_ORIGIN=https://decisions.giorgi.app
Environment=DATABASE_PATH=/var/lib/giorgi-decisions/rooms.sqlite
Environment=TRUST_PROXY=1
Restart=on-failure
RestartSec=5
MemoryMax=128M
TasksMax=48
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/giorgi-decisions
UMask=0077
[Install]
WantedBy=multi-user.target
UNIT
for pair in 'giorgi-http-playground http-playground' 'giorgi-decisions decisions';do
 read -r name host <<< "$pair"
 if [[ ! -f /etc/nginx/sites-available/$name ]];then
  printf 'server {listen 80;listen [::]:80;server_name %s.giorgi.app;location /.well-known/acme-challenge/ {root /var/www/giorgi-fun-acme;}location / {return 503;}}\n' "$host" > "/etc/nginx/sites-available/$name"
  ln -sfn "/etc/nginx/sites-available/$name" "/etc/nginx/sites-enabled/$name"
 fi
done
nginx -t;systemctl reload nginx
if [[ ! -f /etc/letsencrypt/live/giorgi-fun-apps/fullchain.pem ]];then
 certbot certonly --webroot -w /var/www/giorgi-fun-acme --cert-name giorgi-fun-apps -d http-playground.giorgi.app -d decisions.giorgi.app --non-interactive --agree-tos
fi
cat > /etc/nginx/conf.d/giorgi-decisions.conf <<'NGINX'
limit_req_zone $binary_remote_addr zone=giorgi_decisions:1m rate=15r/s;
map $request_uri $giorgi_room_path { default 0; ~^/room/ 1; }
map "$giorgi_room_path:$arg_room" $giorgi_decisions_robots { "0:" "index, follow"; default "noindex, nofollow"; }
NGINX
python3 - "$base/current" <<'PY'
from pathlib import Path
import sys
root=sys.argv[1]
proxy='proxy_pass http://127.0.0.1:3360; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_read_timeout 15s;'
for name,host,directory in [('giorgi-http-playground','http-playground','http-playground'),('giorgi-decisions','decisions','decision-department/public')]:
 locations='location /api/ {return 404;}' if host=='http-playground' else 'location /api/ {limit_req zone=giorgi_decisions burst=30 nodelay; limit_req_status 429; '+proxy+'}location = /health {'+proxy+'}'
 robots='add_header X-Robots-Tag $giorgi_decisions_robots always; add_header Cache-Control no-store always;' if host=='decisions' else ''
 content=f'''server {{listen 80;listen [::]:80;server_name {host}.giorgi.app;location /.well-known/acme-challenge/ {{root /var/www/giorgi-fun-acme;}}location / {{return 301 https://{host}.giorgi.app$request_uri;}}}}
server {{listen 443 ssl;listen [::]:443 ssl;server_name {host}.giorgi.app;
ssl_certificate /etc/letsencrypt/live/giorgi-fun-apps/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/giorgi-fun-apps/privkey.pem;
root {root}/{directory};client_max_body_size 32k;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header Referrer-Policy no-referrer always;
add_header Content-Security-Policy "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; script-src 'self'; connect-src 'self'; form-action 'self'" always;
{robots}
location /assets/ {{try_files $uri =404; expires 1y;}}
{locations}
location / {{try_files $uri $uri/ /index.html;}}
}}
'''
 p=Path('/etc/nginx/sites-available')/name;tmp=p.with_suffix('.next');tmp.write_text(content);tmp.replace(p)
PY
systemctl daemon-reload;systemctl enable giorgi-decisions;systemctl restart giorgi-decisions
ready=false
for attempt in {1..20};do if curl -fsS --max-time 3 http://127.0.0.1:3360/health >/dev/null;then ready=true;break;fi;sleep 1;done
$ready
nginx -t;systemctl reload nginx
for host in http-playground decisions;do curl -fsS --retry 4 --retry-all-errors --retry-delay 1 --max-time 20 "https://$host.giorgi.app/" >/dev/null;done
curl -fsS --max-time 10 https://decisions.giorgi.app/health
for host in giorgi.app smart-todolist.giorgi.app auth.giorgi.app hls-player.giorgi.app angular-compiler.giorgi.app;do curl -fsS --max-time 20 "https://$host/" >/dev/null;done
systemctl show giorgi-decisions -p ActiveState -p MemoryCurrent -p NRestarts
printf 'PASS two new apps installed; existing sites healthy. Rollback backup: %s\n' "$backup"
