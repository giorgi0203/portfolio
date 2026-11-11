#!/usr/bin/env bash
set -euo pipefail
stage=${1:?disk staging directory required}; source_id=${2:?source SHA required}
[[ $source_id =~ ^[a-f0-9]{40}$ && $stage =~ ^/var/tmp/giorgi-learning-[a-f0-9]{40}$ ]]
ip -4 -o addr show | grep '138.68.64.163/' >/dev/null
[[ -s $stage/browser/index.html && -s $stage/browser/preview/runtime.js ]]
base=/var/www/giorgi-learning-lab
release=$base/releases/$source_id-$(date -u +%Y%m%dT%H%M%S)-$$
backup=/var/backups/giorgi-learning-lab/$(date -u +%Y%m%dT%H%M%S)-$$
site=/etc/nginx/sites-available/giorgi-angular-compiler
[[ -f $site && -L /etc/nginx/sites-enabled/giorgi-angular-compiler ]]
install -d -m 755 "$release"
install -d -m 700 "$backup"
cp -p "$site" "$backup/nginx.conf"
previous=$(readlink "$base/current" || true)
restore(){
 cp -p "$backup/nginx.conf" "$site"
 if [[ -n $previous ]];then ln -sfn "$previous" "$base/current";else rm -f "$base/current";fi
 nginx -t && systemctl reload nginx
}
finish(){ result=$?;trap - EXIT;if ((result!=0));then restore || true;fi;rm -rf -- "$stage";exit "$result"; }
trap finish EXIT
cp -a "$stage/browser/." "$release/";chmod -R a+rX "$release"
python3 - "$site" "$stage/site.next" <<'PY'
from pathlib import Path
import re,sys
source=Path(sys.argv[1]).read_text()
updated,count=re.subn(r'\broot\s+(?:/var/www/giorgi-products/current/lab|/var/www/giorgi-learning-lab/current)\s*;',r'root /var/www/giorgi-learning-lab/current;',source)
if count!=1:raise SystemExit('The inspected compiler static root did not match exactly once')
# Preserve every API route and the existing ACME/TLS certificate configuration.
if 'location = /preview/runtime.js' not in updated:
 updated=updated.replace('client_max_body_size 220k;', 'client_max_body_size 220k;\nlocation = /preview/runtime.js {add_header Cache-Control no-cache always; add_header X-Content-Type-Options nosniff always; try_files $uri =404;}')
Path(sys.argv[2]).write_text(updated)
PY
ln -sfn "$release" "$base/current"
install -m 644 "$stage/site.next" "$site.next"
mv -Tf "$site.next" "$site"
nginx -t;systemctl reload nginx
ready=false
for attempt in {1..10};do
 if curl -fsS --max-time 20 --resolve angular-compiler.giorgi.app:443:127.0.0.1 https://angular-compiler.giorgi.app/ -o "$stage/served.html" && cmp -s "$stage/served.html" "$release/index.html";then ready=true;break;fi
 sleep 1
done
$ready
for host in giorgi.app auth.giorgi.app hls-player.giorgi.app toolbox.giorgi.app status.giorgi.app api.giorgi.app smart-todolist.giorgi.app;do curl -fsSL --max-time 20 "https://$host/" >/dev/null;done
[[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://angular-compiler.giorgi.app/api/learning/experiments) == 401 ]]
for host in example-mcp mcp;do [[ $(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "https://$host.giorgi.app/") == 410 ]];done
! systemctl is-active --quiet giorgi-example-mcp
! systemctl is-active --quiet giorgi-mcp-gateway
echo "PASS inspected Learning Lab release $source_id; accounts/APIs and other apps preserved. Backup: $backup"
