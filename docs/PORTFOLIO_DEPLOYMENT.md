# Portfolio hub and deployed sites

The portfolio links directly to the deployed HLS Player and Smart Todo List in
both navigation and Featured Projects. The project catalog is maintained in
`apps/portfolio/src/app/deployed-apps.ts`; it does not depend on the portfolio API
or on another application's federation manifest. Legacy unknown client routes
return to the home page. Production API settings use the deployed API URL,
not localhost. Cards include local SVG previews and links to the source repos.

## Validation

- Portfolio production build, four unit tests and lint pass.
- Browser checks verify the two subdomain links in the navigation and cards,
  one application shell, loaded grid styles, desktop/mobile layout, and absence
  of localhost API requests or uncaught browser errors.
- HLS Player renders and plays a deterministic test HLS stream.
- Smart Todo List renders and passes creation, completion and deletion of a test
  task, ending back in its empty state. AI response quality was not validated.
- The apex and www alias both return HTTPS pages.

The existing portfolio `/api/health` endpoint returns 404. Nginx routes its API
to port 3000, which currently serves the Next.js Smart Todo List. This deployment
preserves that service and routing. The portfolio retains its existing fallback
skills and contact form; contact submission was not tested. Its app links and
project catalog remain available independently of the API.

## Deployment

Build with Node 24 from the repository root:

```bash
NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx build portfolio --configuration=production
```

The static output is `dist/apps/portfolio/`. A prebuilt artifact on the separate
`deploy/portfolio-artifacts` branch contains these files and
`deploy/install-portfolio.sh`. The deployment workflow pins the artifact's full
commit and SHA-256 checksum. Updating source requires a newly built/tested artifact
and updating those pins before pushing the deployment workflow.

`.github/workflows/portfolio-deploy.yml` uses the existing droplet SSH secrets in
GitHub Actions. The installer verifies the expected droplet, saves a private Nginx
backup, and changes only the portfolio's static root to
`/var/www/portfolio-live/current`. The former `/var/www/portfolio/current/browser`
content stays intact. TLS, API proxy locations and the other virtual hosts are
preserved. Nginx configuration and the served index are checked before accepting
the deployment; failed readiness restores the old config and release link.

New assets live under `/var/www/portfolio-live/releases/`, with Nginx backups in
`/var/www/portfolio-live/backups/`. The old CI deployment script targets the former
static directory, so deploy future portfolio updates using the new workflow.

HTTPS browser tests in this cloud use curl's normal TLS verification to relay
public site assets into Chromium because its isolated profile does not trust the
cloud proxy CA. No TLS verification is disabled. HLS media tests use a generated
local video fixture rather than relying on third-party demo-stream availability.
