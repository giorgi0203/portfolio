#!/usr/bin/env bash
# Publish the photography and receipt apps along with the Decision backend that powers receipt scanning.
set -euo pipefail
operation=${1:?operation required}; key=${2:?release id required}
[[ $key =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]]
ip -4 -o addr show | grep -F '138.68.64.163/' >/dev/null
base=/var/www/giorgi-photo-table
release=$base/releases/$key
backup=/var/backups/giorgi-photo-table/$key
decision=/var/www/giorgi-decision-menu/current
portfolio=/var/www/portfolio-live/current
enabled=/etc/nginx/sites-enabled
available=/etc/nginx/sites-available
hosts=(same-frame split-supra)
acme=/var/www/giorgi-photo-table-acme
swap() { ln -sfnT "$1" "$2.next-$key"; mv -Tf "$2.next-$key" "$2"; }
reload() { nginx -t && systemctl reload nginx; }
healthy() {
  for attempt in {1..20}; do
    if curl -fsS --max-time 2 http://127.0.0.1:3360/health >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}
restore() {
  local h
  if [[ $(readlink "$portfolio") == "$release/portfolio" ]]; then swap "$(cat "$backup/portfolio")" "$portfolio"; fi
  if [[ $(readlink "$decision") == "$release/decision" ]]; then
    swap "$(cat "$backup/decision")" "$decision"
    systemctl restart giorgi-decisions
  fi
  cp -p "$backup/decisions.conf" "$available/giorgi-decisions"
  for h in "${hosts[@]}"; do
    if [[ -f $backup/$h.conf ]]; then cp -p "$backup/$h.conf" "$available/giorgi-$h"; else rm -f "$enabled/giorgi-$h" "$available/giorgi-$h"; fi
  done
  reload
  healthy
}
if [[ $operation == rollback ]]; then
  [[ $(readlink "$decision") == "$release/decision" ]]
  restore
  exit
fi
if [[ $operation == gallery ]]; then
  [[ $(readlink "$decision") == "$release/decision" && $(readlink "$portfolio") == "$(cat "$backup/portfolio")" ]]
  for h in "${hosts[@]}"; do curl -fsS --max-time 12 "https://$h.giorgi.app/" -o /dev/null; done
  swap "$release/portfolio" "$portfolio"
  curl -fsS --retry 3 --max-time 12 --resolve giorgi.app:443:127.0.0.1 https://giorgi.app/ -o "$backup/published.html"
  cmp "$backup/published.html" "$release/portfolio/index.html"
  exit
fi
[[ $operation == install && ! -e $release && ! -e $backup ]]
[[ -L $decision && -L $portfolio && -L $enabled/giorgi-decisions ]]
for h in "${hosts[@]}"; do
  [[ -s $h/index.html ]]
  [[ ! -e $available/giorgi-$h || -L $enabled/giorgi-$h && $(readlink -f "$enabled/giorgi-$h") == "$available/giorgi-$h" ]]
done
[[ -s decision/server/server.mjs && -s decision/shared/split.mjs && -s portfolio/assets/giorgi-and-cat.webp && -s portfolio/assets/same-frame.webp && -s portfolio/assets/split-supra.webp ]]
install -d -m755 "$release" "$release/decision" "$acme"
install -d -m700 "$backup"
readlink "$decision" > "$backup/decision"
readlink "$portfolio" > "$backup/portfolio"
cp -p "$available/giorgi-decisions" "$backup/decisions.conf"
for h in "${hosts[@]}"; do
  if [[ -f $available/giorgi-$h ]]; then cp -p "$available/giorgi-$h" "$backup/$h.conf"; fi
done
cp -a same-frame split-supra portfolio "$release/"
cp -a decision/server decision/shared "$release/decision/"
cp -a "$decision/public" "$release/decision/public"
chown -hR root:root "$release"; chmod -R a+rX,go-w "$release"
install -m700 deploy/install-supra-frame.sh "$backup/installer"
python3 - "$backup" <<'PY'
import sqlite3,sys,os
p=sys.argv[1]+'/rooms.sqlite'
with sqlite3.connect('file:/var/lib/giorgi-decisions/rooms.sqlite?mode=ro',uri=True) as src,sqlite3.connect(p) as dst:src.backup(dst)
os.chmod(p,0o600)
PY
trap 'result=$?; trap - EXIT; if ((result)); then restore; fi; exit "$result"' EXIT
for h in "${hosts[@]}"; do
  if [[ ! -f $available/giorgi-$h ]]; then
    printf 'server {listen 80; listen [::]:80; server_name %s.giorgi.app; location /.well-known/acme-challenge/ {root %s;} location / {return 503;} }\n' "$h" "$acme" > "$available/giorgi-$h"
    ln -s "$available/giorgi-$h" "$enabled/giorgi-$h"
  fi
done
reload
if [[ ! -s /etc/letsencrypt/live/giorgi-photo-table/fullchain.pem ]]; then
  certbot certonly --webroot -w "$acme" --cert-name giorgi-photo-table -d same-frame.giorgi.app -d split-supra.giorgi.app --non-interactive --agree-tos
fi
python3 deploy/photo-table-sites.py "$release" "$backup"
swap "$release/decision" "$decision"
systemctl restart giorgi-decisions
healthy
reload
for h in "${hosts[@]}"; do
  for attempt in {1..12}; do
    if curl -fsS --max-time 5 --resolve "$h.giorgi.app:443:127.0.0.1" "https://$h.giorgi.app/" -o "$backup/$h.html" && cmp -s "$backup/$h.html" "$release/$h/index.html"; then break; fi
    sleep 1
  done
  cmp -s "$backup/$h.html" "$release/$h/index.html"
done
python3 deploy/verify-supra-receipt.py deploy/receipt.png
