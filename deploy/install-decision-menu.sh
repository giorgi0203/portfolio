#!/usr/bin/env bash
# Update the Decision service and its shared identity client, retaining room data.
set -euo pipefail
stage=${1:?stage required}; release_id=${2:?release SHA required}
[[ $release_id =~ ^[a-f0-9]{40}$ && $stage == "/var/tmp/giorgi-decision-menu-$release_id" ]]
ip -4 -o addr show | grep '138.68.64.163/' >/dev/null
node=/opt/smart-todo-node-24.22.1/bin/node
[[ -x $node && -s $stage/decision/public/index.html && -s $stage/decision/server/menu.mjs && -s $stage/identity/server.js ]]
[[ -s /etc/smart-todolist/ai.json && -s /var/lib/giorgi-decisions/rooms.sqlite && -s /var/lib/smart-todolist/workspace.sqlite ]]
[[ $(systemctl show giorgi-identity -p WorkingDirectory --value) == /var/www/giorgi-identity/current ]]
[[ $(readlink -f /etc/nginx/sites-enabled/giorgi-decisions) == /etc/nginx/sites-available/giorgi-decisions ]]
nginx -t
base=/var/www/giorgi-decision-menu
identity_base=/var/www/giorgi-identity-menu
suffix=$release_id-$(date -u +%Y%m%dT%H%M%S)-$$
release=$base/releases/$suffix
identity_release=$identity_base/releases/$suffix
backup=/var/backups/giorgi-decision-menu/$suffix
install -d -m 755 "$release" "$identity_release"
install -d -m 700 "$backup"
previous=$(readlink "$base/current" || true)
identity_previous=$(readlink /var/www/giorgi-identity/current)
cp -p /etc/nginx/sites-available/giorgi-decisions "$backup/site.conf"
cp -p /etc/systemd/system/giorgi-decisions.service "$backup/decision.service"
if [[ -f /etc/giorgi-decisions/ai.json ]];then cp -p /etc/giorgi-decisions/ai.json "$backup/ai.json";fi
python3 - "$backup" <<'PY'
import sqlite3,sys,os
from pathlib import Path
for name,source in [('rooms.sqlite','/var/lib/giorgi-decisions/rooms.sqlite'),('identity.sqlite','/var/lib/smart-todolist/workspace.sqlite')]:
 with sqlite3.connect(source) as incoming,sqlite3.connect(str(Path(sys.argv[1])/name)) as outgoing:incoming.backup(outgoing)
 os.chmod(str(Path(sys.argv[1])/name),0o600)
PY
swap(){ ln -s "$1" "$2.next-$$";mv -Tf "$2.next-$$" "$2"; }
rollback(){
 if [[ -n $previous ]];then swap "$previous" "$base/current";else rm -f "$base/current";fi
 swap "$identity_previous" /var/www/giorgi-identity/current
 cp -p "$backup/site.conf" /etc/nginx/sites-available/giorgi-decisions
 cp -p "$backup/decision.service" /etc/systemd/system/giorgi-decisions.service
 if [[ -f $backup/ai.json ]];then cp -p "$backup/ai.json" /etc/giorgi-decisions/ai.json;else rm -f /etc/giorgi-decisions/ai.json;fi
 systemctl daemon-reload;systemctl restart giorgi-identity;systemctl restart giorgi-decisions
 nginx -t && systemctl reload nginx
}
finish(){ result=$?;trap - EXIT;if ((result!=0));then rollback || true;fi;rm -rf -- "$stage";exit "$result"; }
trap finish EXIT
cp -a "$stage/decision/." "$release/"
cp -a "$stage/identity/." "$identity_release/"
chmod -R a+rX "$release" "$identity_release"
install -d -o root -g giorgi-decisions -m 750 /etc/giorgi-decisions
python3 - <<'PY'
from pathlib import Path
import json,os,grp
source=json.loads(Path('/etc/smart-todolist/ai.json').read_text())
assert isinstance(source.get('apiKey'),str) and source['apiKey'].strip()
assert source.get('baseUrl','https://api.openai.com/v1').rstrip('/')=='https://api.openai.com/v1'
target=Path('/etc/giorgi-decisions/ai.json')
target.write_text(json.dumps({'apiKey':source['apiKey'],'baseUrl':'https://api.openai.com/v1','model':'gpt-4.1-mini'}))
os.chown(target,0,grp.getgrnam('giorgi-decisions').gr_gid);os.chmod(target,0o640)
print('PASS server-only menu AI configuration installed')
PY
swap "$identity_release" /var/www/giorgi-identity/current
swap "$release" "$base/current"
cat > /etc/systemd/system/giorgi-decisions.service <<UNIT
[Unit]
Description=Decision Department rooms and private menu scans
After=network.target giorgi-identity.service
[Service]
User=giorgi-decisions
Group=giorgi-decisions
WorkingDirectory=$base/current
ExecStart=$node server/server.mjs
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3360
Environment=APP_ORIGIN=https://decisions.giorgi.app
Environment=DATABASE_PATH=/var/lib/giorgi-decisions/rooms.sqlite
Environment=TRUST_PROXY=1
Environment=AUTH_PUBLIC_URL=https://auth.giorgi.app
Environment=AUTH_INTERNAL_URL=http://127.0.0.1:3100
Environment=AI_CONFIG_FILE=/etc/giorgi-decisions/ai.json
Restart=on-failure
RestartSec=5
MemoryMax=192M
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
python3 - "$base/current/public" <<'PY'
from pathlib import Path
import sys
root=sys.argv[1]
proxy='proxy_pass http://127.0.0.1:3360;proxy_http_version 1.1;proxy_set_header Host $host;proxy_set_header X-Real-IP $remote_addr;proxy_set_header X-Forwarded-For $remote_addr;proxy_set_header X-Forwarded-Proto $scheme;proxy_read_timeout 40s;'
content='''server {listen 80;listen [::]:80;server_name decisions.giorgi.app;location /.well-known/acme-challenge/ {root /var/www/giorgi-fun-acme;}location / {return 301 https://decisions.giorgi.app$request_uri;}}
server {listen 443 ssl;listen [::]:443 ssl;server_name decisions.giorgi.app;
ssl_certificate /etc/letsencrypt/live/giorgi-fun-apps/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/giorgi-fun-apps/privkey.pem;
ROOT
client_max_body_size 32k;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header Referrer-Policy no-referrer always;
add_header Content-Security-Policy "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self' blob: data:; form-action 'self'" always;
add_header X-Robots-Tag $giorgi_decisions_robots always;
add_header Cache-Control no-store always;
location /assets/ {try_files $uri =404;expires 1y;}
location = /api/menu/analyze {client_max_body_size 3m;access_log off;limit_req zone=giorgi_decisions burst=5 nodelay;limit_req_status 429;PROXY}
location /api/ {access_log off;limit_req zone=giorgi_decisions burst=30 nodelay;limit_req_status 429;PROXY}
location = /health {PROXY}
location / {try_files $uri $uri/ /index.html;}
}
'''.replace('ROOT','root '+root+';').replace('PROXY',proxy)
target=Path('/etc/nginx/sites-available/giorgi-decisions');temporary=target.with_suffix('.next');temporary.write_text(content);temporary.replace(target)
PY
systemctl daemon-reload
systemctl restart giorgi-identity
systemctl restart giorgi-decisions
ready=false
for attempt in {1..25};do
 if curl -fsS --max-time 3 http://127.0.0.1:3100/api/health >/dev/null && curl -fsS --max-time 3 http://127.0.0.1:3360/health >/dev/null;then ready=true;break;fi
 sleep 1
done
$ready
nginx -t;systemctl reload nginx
ready=false
for attempt in {1..12};do
 if curl -fsS --max-time 10 --resolve decisions.giorgi.app:443:127.0.0.1 https://decisions.giorgi.app/ -o "$stage/served.html" && cmp -s "$stage/served.html" "$release/public/index.html";then ready=true;break;fi
 sleep 1
done
$ready
python3 - <<'PY'
import json,urllib.request
with urllib.request.urlopen('https://decisions.giorgi.app/api/menu/session',timeout=10) as r:
 data=json.load(r);assert data['user'] is None and data['configured'] is True
request=urllib.request.Request('http://127.0.0.1:3100/api/sso/session',data=json.dumps({'client_id':'decision-department','session_token':'0'*64}).encode(),headers={'Content-Type':'application/json'},method='POST')
with urllib.request.urlopen(request,timeout=10) as r:assert json.load(r)['user'] is None
print('PASS shared menu authentication endpoints and AI readiness')
PY
python3 "$stage/deploy/verify-decision-menu.py" "$stage/deploy/menu.png"
for host in decisions.giorgi.app auth.giorgi.app giorgi.app smart-todolist.giorgi.app http-playground.giorgi.app angular-compiler.giorgi.app;do curl -fsS --retry 3 --retry-all-errors --retry-delay 1 --max-time 15 "https://$host/" -o /dev/null;printf 'HTTPS verified: %s\n' "$host";done
printf 'Decision menu release: %s\nIdentity release: %s\nRollback backup: %s\n' "$release" "$identity_release" "$backup"
