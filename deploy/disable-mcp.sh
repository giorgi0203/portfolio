#!/usr/bin/env bash
set -euo pipefail
ip -4 -o addr show | grep '138.68.64.163/' >/dev/null
certificate=/etc/letsencrypt/live/angular-compiler.giorgi.app
[[ -s $certificate/fullchain.pem && -s $certificate/privkey.pem ]]
backup=/var/backups/giorgi-extras/retire-mcp-$(date -u +%Y%m%dT%H%M%S)-$$
install -d -m 700 "$backup" /etc/giorgi-extras
services=(giorgi-example-mcp giorgi-mcp-gateway)
for name in "${services[@]}"; do
  cp -p "/etc/nginx/sites-available/$name" "$backup/$name"
  systemctl is-active "$name" > "$backup/$name.active" || true
  systemctl is-enabled "$name" > "$backup/$name.enabled" || true
done
[[ ! -f /etc/giorgi-extras/mcp-disabled ]] || cp -p /etc/giorgi-extras/mcp-disabled "$backup/previous-marker"
rollback() {
  for name in "${services[@]}"; do
    cp -p "$backup/$name" "/etc/nginx/sites-available/$name"
    if grep -qx enabled "$backup/$name.enabled"; then systemctl enable "$name"; fi
    if grep -qx active "$backup/$name.active"; then systemctl start "$name"; fi
  done
  if [[ -f $backup/previous-marker ]]; then cp -p "$backup/previous-marker" /etc/giorgi-extras/mcp-disabled;
  else rm -f /etc/giorgi-extras/mcp-disabled; fi
  nginx -t && systemctl reload nginx
}
trap 'result=$?; if ((result!=0)); then rollback; fi; exit "$result"' EXIT
printf 'Disabled by the site owner. Keep the MCP services stopped.\n' > /etc/giorgi-extras/mcp-disabled
python3 - <<'PY'
from pathlib import Path
for name,host in [('giorgi-example-mcp','example-mcp'),('giorgi-mcp-gateway','mcp')]:
    # ACME paths must stay reachable for renewal of the existing four-host certificate.
    config=f'''server {{
 listen 80; listen [::]:80; server_name {host}.giorgi.app;
 location /.well-known/acme-challenge/ {{ root /var/www/giorgi-labs-acme; }}
 location / {{ default_type text/plain; return 410 "This experiment has been disabled. Visit https://giorgi.app/\\n"; }}
}}
server {{
 listen 443 ssl; listen [::]:443 ssl; server_name {host}.giorgi.app;
 ssl_certificate /etc/letsencrypt/live/angular-compiler.giorgi.app/fullchain.pem;
 ssl_certificate_key /etc/letsencrypt/live/angular-compiler.giorgi.app/privkey.pem;
 location / {{ default_type text/plain; return 410 "This experiment has been disabled. Visit https://giorgi.app/\\n"; }}
}}
'''
    target=Path('/etc/nginx/sites-available')/name
    pending=target.with_suffix('.next')
    pending.write_text(config)
    pending.replace(target)
PY
nginx -t
systemctl reload nginx
systemctl disable --now "${services[@]}"
for service in "${services[@]}"; do
  ! systemctl is-active --quiet "$service"
  ! systemctl is-enabled --quiet "$service"
done
for host in example-mcp mcp; do
  for path in / /mcp /mcp/example /health; do
    status=$(curl -sS --max-time 10 --resolve "$host.giorgi.app:443:127.0.0.1" -o /dev/null -w '%{http_code}' "https://$host.giorgi.app$path")
    [[ $status == 410 ]]
  done
done
for host in giorgi.app auth.giorgi.app hls-player.giorgi.app smart-todolist.giorgi.app angular-compiler.giorgi.app api.giorgi.app; do
  curl -fsSL --max-time 15 "https://$host/" >/dev/null
done
echo "PASS MCP services stopped and disabled; retired endpoints return 410; active sites and API remain healthy. Backup: $backup"
