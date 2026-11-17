#!/usr/bin/env bash
# Static-only host release: no shared app services, databases or unrelated sites change.
set -euo pipefail
stage=${1:?stage required}; release_id=${2:?release SHA required}
[[ $release_id =~ ^[a-f0-9]{40}$ && $stage == "/var/tmp/giorgi-bug-safari-$release_id" ]]
ip -4 -o addr show | grep '138.68.64.163/' >/dev/null
[[ -s $stage/app/index.html && -s $stage/app/runner.js ]]
nginx -t
base=/var/www/giorgi-bug-safari
site=/etc/nginx/sites-available/giorgi-bug-safari
release=$base/releases/$release_id-$(date -u +%Y%m%dT%H%M%S)-$$
backup=/var/backups/giorgi-bug-safari/$(date -u +%Y%m%dT%H%M%S)-$$
install -d -m 755 "$release" /var/www/giorgi-bug-safari-acme
install -d -m 700 "$backup"
[[ ! -e $base/current || -L $base/current ]]
previous=$(readlink "$base/current" || true)
[[ ! -f $site ]] || cp -p "$site" "$backup/site.conf"
rollback(){
 if [[ -n $previous ]];then ln -s "$previous" "$base/restore-$$";mv -Tf "$base/restore-$$" "$base/current";else rm -f "$base/current";fi
 if [[ -f $backup/site.conf ]];then cp -p "$backup/site.conf" "$site";else rm -f "$site" /etc/nginx/sites-enabled/giorgi-bug-safari;fi
 nginx -t && systemctl reload nginx
}
finish(){ result=$?;trap - EXIT;if ((result!=0));then rollback || true;fi;rm -rf -- "$stage";exit "$result"; }
trap finish EXIT
cp -a "$stage/app/." "$release/";chmod -R a+rX "$release"
ln -s "$release" "$base/next-$$";mv -Tf "$base/next-$$" "$base/current"
if [[ ! -f $site ]];then
 printf 'server {listen 80;listen [::]:80;server_name bug-safari.giorgi.app;location /.well-known/acme-challenge/ {root /var/www/giorgi-bug-safari-acme;}location / {return 503;}}\n' > "$site"
 ln -sfn "$site" /etc/nginx/sites-enabled/giorgi-bug-safari
 nginx -t;systemctl reload nginx
fi
if [[ ! -f /etc/letsencrypt/live/bug-safari.giorgi.app/fullchain.pem ]];then
 certbot certonly --webroot -w /var/www/giorgi-bug-safari-acme --cert-name bug-safari.giorgi.app -d bug-safari.giorgi.app --non-interactive --agree-tos
fi
cat > "$stage/site.next" <<'NGINX'
server {
 listen 80;listen [::]:80;server_name bug-safari.giorgi.app;
 location /.well-known/acme-challenge/ {root /var/www/giorgi-bug-safari-acme;}
 location / {return 301 https://bug-safari.giorgi.app$request_uri;}
}
server {
 listen 443 ssl;listen [::]:443 ssl;server_name bug-safari.giorgi.app;
 ssl_certificate /etc/letsencrypt/live/bug-safari.giorgi.app/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/bug-safari.giorgi.app/privkey.pem;
 root /var/www/giorgi-bug-safari/current;
 expires -1;
 add_header X-Content-Type-Options nosniff always;
 add_header X-Frame-Options DENY always;
 add_header Referrer-Policy no-referrer always;
 add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; worker-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'" always;
 location = /runner.js {
  try_files $uri =404;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy no-referrer always;
  add_header Content-Security-Policy "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'" always;
 }
 location /assets/ {try_files $uri =404;expires 1y;}
 location /api/ {return 404;}
 location / {try_files $uri $uri/ /index.html;}
}
NGINX
install -m 644 "$stage/site.next" "$site.next-$$";mv -Tf "$site.next-$$" "$site"
nginx -t;systemctl reload nginx
ready=false
for attempt in {1..12};do
 if curl -fsS --max-time 10 --resolve bug-safari.giorgi.app:443:127.0.0.1 https://bug-safari.giorgi.app/ -D "$stage/main.headers" -o "$stage/served.html" && cmp -s "$stage/served.html" "$release/index.html" && curl -fsS --max-time 10 --resolve bug-safari.giorgi.app:443:127.0.0.1 https://bug-safari.giorgi.app/runner.js -D "$stage/worker.headers" -o "$stage/served.js" && cmp -s "$stage/served.js" "$release/runner.js";then ready=true;break;fi
 sleep 1
done
$ready
python3 - "$stage" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
def csp(name):
 for line in (root/name).read_text().splitlines():
  if line.lower().startswith('content-security-policy:'):return line.split(':',1)[1].strip()
 raise RuntimeError('Missing execution policy')
main=csp('main.headers');worker=csp('worker.headers')
assert "'unsafe-eval'" not in main
assert "script-src 'unsafe-eval'" in worker and "connect-src 'none'" in worker and "worker-src 'none'" in worker
print('PASS separate main-page and disposable-worker execution policies')
PY
for host in bug-safari.giorgi.app giorgi.app angular-compiler.giorgi.app smart-todolist.giorgi.app;do curl -fsS --retry 3 --retry-all-errors --retry-delay 1 --max-time 20 "https://$host/" -o /dev/null;printf 'HTTPS verified: %s\n' "$host";done
printf 'Bug Safari release: %s\nRollback backup: %s\n' "$release" "$backup"
