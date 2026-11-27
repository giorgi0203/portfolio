#!/usr/bin/env bash
set -euo pipefail

operation=${1:?install or rollback required}
release_id=${2:?commit and workflow run required}
[[ $release_id =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]]
ip -4 -o addr show | grep -F '138.68.64.163/' >/dev/null

base=/var/www/hls-player
release=$base/releases/$release_id
backup=/var/backups/giorgi-stream-doctor/$release_id
site=/etc/nginx/sites-enabled/hls-player
[[ -L $base/current && -d $base/current && -f $site ]]
grep -Eq 'root[[:space:]]+/var/www/hls-player/current;' "$site"

switch_release() {
  ln -sfnT "$1" "$base/current.$release_id.next"
  mv -Tf "$base/current.$release_id.next" "$base/current"
}

restore() {
  # An old workflow must never roll back a later release.
  [[ $(readlink "$base/current") == "$release" ]]
  switch_release "$(cat "$backup/previous")"
}

if [[ $operation == rollback ]]; then
  restore
  echo "Restored preceding HLS release."
  exit 0
fi

[[ $operation == install && ! -e $release && ! -e $backup ]]
for entry in index.html mf-manifest.json remoteEntry.mjs; do [[ -s hls-player/$entry ]]; done
install -d -m 755 "$release"
install -d -m 700 "$backup"
readlink "$base/current" > "$backup/previous"
install -m 700 install-stream-doctor.sh "$backup/installer"
cp -a hls-player/. "$release/"
chown -hR root:root "$release"
chmod -R a+rX,go-w "$release"

switch_release "$release"
trap 'result=$?; trap - EXIT; if ((result!=0)); then restore; fi; exit "$result"' EXIT
for entry in index.html mf-manifest.json remoteEntry.mjs; do
  curl -fsS --max-time 10 --resolve hls-player.giorgi.app:443:127.0.0.1 \
    "https://hls-player.giorgi.app/$entry" -o "$backup/served"
  cmp -s "$release/$entry" "$backup/served"
done
echo "Activated HLS release $release_id."
