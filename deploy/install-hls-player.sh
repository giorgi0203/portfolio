#!/usr/bin/env bash
# Run as root on the confirmed droplet, with a trusted build uploaded by CI.
set -euo pipefail
stage=${1:?staging directory required}
release_id=${2:?commit SHA required}
[[ "$release_id" =~ ^[0-9a-f]{40}$ ]]
[[ "$stage" == "/tmp/giorgi-hls-$release_id" ]]
ip -4 -o addr show | grep '138.68.64.163/' >/dev/null
command -v certbot >/dev/null
nginx -t

target=/var/www/hls-player
site=/etc/nginx/sites-available/hls-player
enabled=/etc/nginx/sites-enabled/hls-player
# Preserve existing sites and Certbot's TLS additions on subsequent deploys.
if [[ -e "$site" ]]; then
  grep -q 'server_name hls-player.giorgi.app;' "$site"
  grep -q 'root /var/www/hls-player/current;' "$site"
fi
if [[ -e "$enabled" || -L "$enabled" ]]; then
  [[ -L "$enabled" && "$(readlink -f "$enabled")" == "$site" ]]
fi
[[ ! -e "$target/current" || -L "$target/current" ]]
previous=$(readlink "$target/current" || true)
release="$target/releases/$release_id-$(date -u +%Y%m%dT%H%M%S)-$$"
install -d -m 755 "$release"
tar -xzf "$stage/hls-player.tar.gz" -C "$release" --no-same-owner
[[ -s "$release/index.html" && -s "$release/mf-manifest.json" && -s "$release/remoteEntry.mjs" ]]
chmod -R a+rX "$target"
created_site=false
created_link=false
rollback() {
  if [[ -n "$previous" ]]; then
    ln -s "$previous" "$target/rollback-$$"
    mv -Tf "$target/rollback-$$" "$target/current"
  else
    rm -f "$target/current"
  fi
  if $created_link; then rm -f "$enabled"; fi
  if $created_site; then rm -f "$site"; fi
}
ln -s "$release" "$target/next-$$"
mv -Tf "$target/next-$$" "$target/current"
if [[ ! -e "$site" ]]; then
  install -m 644 "$stage/deploy/nginx/hls-player.conf" "$site"
  created_site=true
fi
if [[ ! -L "$enabled" ]]; then
  ln -s "$site" "$enabled"
  created_link=true
fi
if ! nginx -t; then rollback; exit 1; fi
if ! systemctl reload nginx; then rollback; exit 1; fi
# Reload is asynchronous: retry until new workers serve this virtual host.
if ! curl --fail --silent --show-error --retry 8 --retry-all-errors --retry-delay 1 --max-time 10 -H 'Host: hls-player.giorgi.app' -H 'Connection: close' http://127.0.0.1/ -o "$stage/http-check.html" || ! grep -q '<title>hls-player</title>' "$stage/http-check.html"; then
  rollback
  nginx -t && systemctl reload nginx
  exit 1
fi
# Reuse this server's existing ACME account. Failure is reported; no security bypass.
certbot --nginx --non-interactive --redirect -d hls-player.giorgi.app
nginx -t
systemctl reload nginx
curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 --max-time 20 https://hls-player.giorgi.app/ -o /dev/null
curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 --max-time 20 https://hls-player.giorgi.app/mf-manifest.json -o /dev/null
printf 'Deployed HLS Player release %s\n' "$release"
