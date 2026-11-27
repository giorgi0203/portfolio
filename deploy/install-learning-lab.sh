#!/usr/bin/env bash
set -euo pipefail

operation=${1:?install or rollback required}
release_id=${2:?commit and workflow run required}
[[ $release_id =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]]
ip -4 -o addr show | grep -F '138.68.64.163/' >/dev/null

base=/var/www/giorgi-learning-lab
release=$base/releases/$release_id
backup=/var/backups/giorgi-learning-lab/$release_id
service=giorgi-compiler.service
dropin=/etc/systemd/system/$service.d/90-learning-lab-release.conf
site=/etc/nginx/sites-enabled/giorgi-angular-compiler
lab=https://angular-compiler.giorgi.app
local_https=(--resolve angular-compiler.giorgi.app:443:127.0.0.1)
# Only release to the independent Lab, preserving Nginx, TLS, auth and the unit's sandbox.
[[ -L $site && -L $base/current ]]
grep -Eq 'root[[:space:]]+/var/www/giorgi-learning-lab/current;' "$site"
[[ $(systemctl show -p User --value "$service") == giorgi-compiler ]]
[[ -d /var/lib/giorgi-compiler/tmp ]]

switch_browser() {
  ln -sfnT "$1" "$base/current.$release_id.next"
  mv -Tf "$base/current.$release_id.next" "$base/current"
}

wait_compiler() {
  local attempt
  for attempt in {1..20}; do
    if curl -fsS --max-time 2 http://127.0.0.1:3301/health >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

restore() {
  switch_browser "$(cat "$backup/browser")"
  if [[ -f $backup/compiler.conf ]]; then
    install -m 644 "$backup/compiler.conf" "$dropin"
  else
    rm -f "$dropin"
  fi
  systemctl daemon-reload
  systemctl restart "$service"
  wait_compiler
}

if [[ $operation == rollback ]]; then
  # A late browser result must never revert someone else's release.
  [[ $(readlink "$base/current") == "$release/browser" ]]
  [[ $(systemctl show -p WorkingDirectory --value "$service") == "$release/compiler" ]]
  restore
  echo "Restored Learning Lab from $backup"
  exit
fi

[[ $operation == install && ! -e $release && ! -e $backup ]]
[[ -s browser/index.html && -s browser/preview/runtime.js ]]
[[ -s compiler/main.js && -s compiler/compiler/worker.js && -d compiler/node_modules ]]
current_compiler=$(systemctl show -p WorkingDirectory --value "$service")
[[ $current_compiler == /var/www/giorgi-products/current/compiler || $current_compiler == "$base"/releases/*/compiler ]]

install -d -m 755 "$release" "$(dirname "$dropin")"
install -d -m 700 "$backup"
readlink "$base/current" >"$backup/browser"
if [[ -f $dropin ]]; then cp -p "$dropin" "$backup/compiler.conf"; fi
cp -a browser compiler "$release/"
chown -hR root:root "$release"
chmod -R a+rX,go-w "$release"

# Restore both halves on installation or smoke-test failure.
trap 'result=$?; trap - EXIT; if (( result != 0 )); then (set -e; restore); fi; exit "$result"' EXIT
cat >"$dropin.next" <<UNIT
[Service]
WorkingDirectory=$release/compiler
Environment=COMPILER_NODE_MODULES=$release/compiler/node_modules
UNIT
chmod 644 "$dropin.next"
mv -Tf "$dropin.next" "$dropin"
systemctl daemon-reload
systemctl restart "$service"
wait_compiler

curl -fsS --max-time 20 http://127.0.0.1:3301/api/compile \
  -H 'Content-Type: application/json' \
  -d '{"componentTs":"import {Component} from \"@angular/core\"; @Component({selector:\"app-demo\",template:\"<h2>{{title}}</h2>\"}) export class DemoComponent {title=\"Lab\";}"}' \
  -o "$backup/smoke.json"
python3 - "$backup/smoke.json" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    result = json.load(f)
files = [file for file in result.get("files", []) if file["path"].endswith("/demo.component.js")]
if not result.get("ok") or not any(
    "ɵɵdefineComponent" in file["content"] and file.get("templateMap", {}).get("mappings")
    and isinstance(file["templateMap"].get("sourceIndex"), int) for file in files
):
    sys.exit("The production compiler did not emit the smoke component and its template map")
PY
switch_browser "$release/browser"
curl -fsS --max-time 15 "${local_https[@]}" "$lab/" -o "$backup/served.html"
cmp -s "$backup/served.html" "$release/browser/index.html"
[[ $(curl -sS --max-time 10 "${local_https[@]}" -o /dev/null -w '%{http_code}' "$lab/api/learning/experiments") == 401 ]]
install -m 700 install-learning-lab.sh "$backup/installer"
echo "Activated Learning Lab $release_id. Rollback state is in $backup."
