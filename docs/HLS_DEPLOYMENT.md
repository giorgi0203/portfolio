# HLS Player on hls-player.giorgi.app

HLS Player is a static Angular app and a federation remote. It needs Nginx,
DNS and TLS; it does not need another Node server on the droplet.

## Build and upload

From the repository root with Node 24 and dependencies installed:

```bash
NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx build hls-player --configuration=production
NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx test hls-player --watch=false
```

Upload **the contents** of `dist/apps/hls-player/` (not a `browser` directory)
to a new `/var/www/hls-player/releases/<unique-release>/` on the droplet.
Keep old releases for rollback. Directories must be traversable and files
readable by the Nginx worker. Point `/var/www/hls-player/current` at that
release using an atomic symlink replacement. Keep the main site's files and
API configuration separate.

## DNS and Nginx

The provided target is `138.68.64.163`. Confirm this is the existing production
droplet before changing its configuration. In the authoritative DNS zone
(reported as DigitalOcean), create an A record `hls-player` pointing there.
Buying the domain at domenebi.ge does not require moving its registration.
Only add AAAA if IPv6 is configured for this droplet.

Inspect and back up existing Nginx configuration before installing
`deploy/nginx/hls-player.conf` as a separate site. Do not replace the apex site.
Once the built app exists at the configured root:

```bash
sudo install -m 644 deploy/nginx/hls-player.conf /etc/nginx/sites-available/hls-player
sudo ln -s /etc/nginx/sites-available/hls-player /etc/nginx/sites-enabled/hls-player
sudo nginx -t
sudo systemctl reload nginx
```

After DNS resolves, use the droplet's existing Certbot installation:

```bash
sudo certbot --nginx -d hls-player.giorgi.app
```

Validate HTTPS, the player page, video playback and `/mf-manifest.json`.
An HTTPS player requires HTTPS video URLs with CORS enabled by the stream
provider. Do not disable browser security or proxy arbitrary URLs on the server.
This subdomain serves the player independently; the existing portfolio's remote
manifest is not changed by this config.

## Connecting this cloud environment

No DigitalOcean credentials or SSH key were present during inspection. GitHub
read access worked; GitHub API and giorgi.app HTTPS were blocked by the current
network allowlist. Draft configuration API updates also failed.

Allow `api.github.com`, `api.digitalocean.com`, `giorgi.app` and
`hls-player.giorgi.app` in Environment settings, preserving other domains.
If using DigitalOcean API access, add an HTTP secret called
`DIGITALOCEAN_ACCESS_TOKEN`, destined only for `api.digitalocean.com`, with a
DigitalOcean token permitted to read droplets and manage the required DNS
records. Enter the token securely in settings, never in chat or the repo.
An API token manages resources/DNS; it does not provide SSH login to an existing
droplet. Existing GitHub Actions secrets cannot be retrieved as plaintext.

Direct SSH additionally requires the correct user/port, a securely provisioned
key, a verified host fingerprint and an allowed TCP route. The initial direct
probe to port 22 was refused; the username `root` is unconfirmed. Alternatively,
GitHub Actions can deploy using its existing droplet secrets once GitHub API and
write access are verified. Do not assume permissions merely from Git read access.

The Nginx file is a prepared configuration, not proof it has been installed or
that the subdomain is live. No remote configuration was changed during preparation.

## Local validation

The production build passed after replacing the incompatible production webpack
wrapper and preserving exports across federation runtime chunks. JavaScript
minification remains enabled; export pruning is disabled for this remote to avoid
the observed `Subject`/`BehaviorSubject` startup failure. Browser validation served
this production output locally, intercepted the default demo-stream requests with
a generated six-second HLS fixture, and confirmed media decoding and playback
progress without uncaught browser errors. This validates the player pipeline,
not availability or CORS policy of external sample streams.

The two unit tests cover rendered controls, native-HLS metadata loading state,
and loading a new URL. The `serve-static` path now matches the actual build output.
Existing unused welcome-component/style-budget build warnings remain.
