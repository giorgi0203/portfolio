#!/usr/bin/env bash
# Install a trusted prebuilt portfolio while retaining the existing API and TLS config.
set -euo pipefail
stage=${1:?staging directory required}
release_id=${2:?commit SHA required}
[[ "$release_id" =~ ^[0-9a-f]{40}$ ]]
[[ "$stage" == "/tmp/giorgi-portfolio-$release_id" ]]
ip -4 -o addr show | grep -q '138.68.64.163/'
nginx -t
site=$(readlink -f /etc/nginx/sites-enabled/portfolio)
[[ "$site" == /etc/nginx/sites-available/portfolio ]]
target=/var/www/portfolio-live
release="$target/releases/$release_id-$(date -u +%Y%m%dT%H%M%S)-$$"
install -d -m 755 "$release/browser"
install -d -m 700 "$target/backups"
tar -xzf "$stage/portfolio.tar.gz" -C "$release/browser" --no-same-owner
[[ -s "$release/browser/index.html" && -s "$release/browser/assets/hls-player.svg" && -s "$release/browser/assets/smart-todolist.svg" ]]
chmod -R a+rX "$release"
backup="$target/backups/$release_id-$$.conf"
cp -p "$site" "$backup"
chmod 600 "$backup"
# Change only the static root; leave all proxy locations, headers and TLS settings intact.
python3 - "$site" "$stage/nginx.next" <<'PY'
import pathlib,re,sys
source=pathlib.Path(sys.argv[1]).read_text()
updated,count=re.subn(r'(\broot\s+)(?:/var/www/portfolio/current/browser|/var/www/portfolio-live/current)(\s*;)',r'\1/var/www/portfolio-live/current\2',source)
if count<1:raise SystemExit('Portfolio Nginx root did not match the inspected configuration')
pathlib.Path(sys.argv[2]).write_text(updated)
PY
[[ ! -e "$target/current" || -L "$target/current" ]]
previous=$(readlink "$target/current" || true)
restore() {
  cp -p "$backup" "$site"
  if [[ -n "$previous" ]]; then
    ln -s "$previous" "$target/restore-$$"
    mv -Tf "$target/restore-$$" "$target/current"
  else
    rm -f "$target/current"
  fi
  nginx -t && systemctl reload nginx
}
ln -s "$release/browser" "$target/next-$$"
mv -Tf "$target/next-$$" "$target/current"
install -m 644 "$stage/nginx.next" "$site.next-$$"
mv -Tf "$site.next-$$" "$site"
if ! nginx -t || ! systemctl reload nginx; then restore; exit 1; fi
ready=false
for attempt in {1..10}; do
  if curl --fail --silent --show-error --max-time 10 --resolve giorgi.app:443:127.0.0.1 https://giorgi.app/ -o "$stage/served-index.html" && cmp -s "$stage/served-index.html" "$release/browser/index.html"; then ready=true; break; fi
  sleep 1
done
if ! $ready; then restore; exit 1; fi
for host in giorgi.app www.giorgi.app smart-todolist.giorgi.app hls-player.giorgi.app; do
  curl --fail --silent --show-error --retry 3 --retry-all-errors --retry-delay 1 --max-time 20 "https://$host/" -o /dev/null
  printf 'HTTPS verified: %s\n' "$host"
done
printf 'Portfolio release: %s\nRollback Nginx backup: %s\n' "$release" "$backup"
