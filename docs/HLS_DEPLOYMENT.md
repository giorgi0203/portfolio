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

DigitalOcean API access is configured through the HTTP secret
`DIGITALOCEAN_ACCESS_TOKEN`, restricted to `api.digitalocean.com`. The token was
verified for droplet reads and creating the `hls-player` DNS record. No token
values belong in this repository. Domain registration remains at domenebi.ge;
the authoritative zone is managed by DigitalOcean.

Direct SSH from this cloud environment was refused on port 22. Deployment instead
uses the existing GitHub Actions secrets `DROPLET_HOST`, `DROPLET_USERNAME`,
`DROPLET_SSH_KEY` and `DROPLET_SSH_PASSPHRASE`. A read-only workflow verified that
those credentials connect to the intended droplet and that Nginx and Certbot are
installed. The HLS workflow downloads a prebuilt artifact from the separate `deploy/hls-player-artifacts` branch, verifies its
pinned SHA-256 checksum, and invokes `deploy/install-hls-player.sh`. The artifact
was built and tested with Node 24 in the cloud environment. Future source updates
require a newly tested artifact and an updated artifact commit/checksum in the workflow. This script preserves
the apex site, tests Nginx, switches the HLS release symlink, and provisions HTTPS
through the existing Certbot account. Old releases remain for rollback. It
preserves Certbot's TLS additions on subsequent runs.

The workflow runs when the dedicated `codex/hls-player-subdomain` branch changes
the deployment workflow, and also supports manual dispatch once registered on the
default branch. Deployment does not depend on retrieving SSH secrets as plaintext.
GitHub Actions log reads require `results-receiver.actions.githubusercontent.com`
in the environment allowlist alongside `api.github.com`, `api.digitalocean.com`,
`giorgi.app`, `hls-player.giorgi.app`.

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

The deployed bundle is stored outside the source history on the artifact branch,
with the workflow pointing at immutable commit
`a505d99f94c9b5f72ff397b45e665297847ed8d3`. SHA-256:
`4546240f0bd387e95634157e2b2175c086420d713c0ff835ace847594ab5896e`.
GitHub release-asset upload was unavailable because the platform GitHub credential
was not accepted by uploads.github.com; no additional credential is needed for
the Git-backed artifact deployment.
