# Additional experiments

**Current state:** Example MCP and MCP Gateway have been retired at the owner’s request. Their systemd services are stopped/disabled and their HTTPS endpoints return 410. Keep the DNS and ACME challenge routes for renewal of the shared certificate. The legacy full-stack deployment is disabled and the installer refuses to run when `/etc/giorgi-extras/mcp-disabled` exists. Compiler and API stay running; API is hidden from the public gallery.


The Angular compiler UI/API, Example MCP, MCP Gateway and Portfolio API are built and tested before deployment. They use the existing droplet and Nginx, with four separate HTTPS hosts:

| Host | Service | Loopback port |
| --- | --- | --- |
| angular-compiler.giorgi.app | `giorgi-compiler` plus static compiler UI | 3301 |
| example-mcp.giorgi.app | `giorgi-example-mcp` | 3331 |
| mcp.giorgi.app | `giorgi-mcp-gateway` | 3340 |
| api.giorgi.app | `giorgi-catalog-api` | 3320 |

The compiler is pinned to Angular 21 and TypeScript 5.9. It produces Ivy JavaScript; it does not execute user components. The three example programs and external HTML/CSS are checked in Chrome and against the API. Inputs are limited to 200 KB; compiler file reads are restricted to the temporary project and installed dependencies. Only one compilation runs at a time, with a 10-second timeout and a 192 MB worker heap. Systemd caps the compiler service and its worker together at 320 MB. Nginx bounds requests. These settings fit the existing 1 GB droplet without running builds on it.

MCP sessions are initialized before use, expire after ten idle minutes, and are limited to 64. Deletion retires a session. The gateway forwards Streamable HTTP headers and reports unhealthy backends with HTTP 503. The public demo uses no AI credentials. Workspace resources read explicitly packaged public metadata, not production application directories.

The standalone Portfolio API serves the same catalog as the homepage. Swagger assets are included locally. Its old contact stub has been retired: it no longer claims that an undelivered enquiry was sent. The homepage continues to use its working mail service.

## Bundle

The immutable `deploy/extra-apps-artifacts` branch contains `extra-apps-deploy.tar.gz`. Its layout is:

- `apps/compiler/`: built API/worker and pinned production-only `node_modules`
- `apps/ui/`: compiled Angular playground, including local Monaco assets
- `apps/example/main.js`, `apps/gateway/main.js`, `apps/api/main.js`
- `apps/swagger/`: local documentation assets
- `apps/metadata/`: public workspace package and project metadata for the MCP demo
- `scripts/check-extra-services.cjs` and `scripts/check-compiler-browser.cjs`
- `deploy/install-extra-apps.sh`

The workflow pins the archive to its Git commit and SHA-256, downloads and expands it under **`/var/tmp` on disk**, then runs the installer. Do not stage this bundle in the droplet's RAM-backed `/tmp`.

The installer creates versioned releases under `/var/www/giorgi-extras/releases`, switches the shared `current` symlink, and installs only these four service units and Nginx vhosts. New services run under separate unprivileged accounts with a read-only filesystem; the compiler can write only its own temporary project directory. TLS uses a dedicated SAN certificate with Certbot renewal. The installer verifies actual HTTPS compilation, MCP operations, the catalog and the existing sites, and restores the previous release/configuration on failure. Private rollback copies are kept under `/var/backups/giorgi-extras`. Staging files are removed on completion.

Browser page views forward to the existing central collector; the shared account/analytics service registers each new hostname. The compiler and developer landing pages remain public. Analytics stay restricted to the configured owner's verified account.
