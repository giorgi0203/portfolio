# Giorgi's personal internet workshop

The portfolio is a playful home for personal apps and future projects. It uses a
warm paper/lime/lavender palette, hand-drawn background icons, a caricature of
Giorgi with his cat, and a filterable app collection called the junk drawer.

## Updating the page

- Apps and navigation: `apps/portfolio/src/app/deployed-apps.ts`.
  Add a deployed URL, source URL, category (`play` or `useful`), and label.
- Page composition/copy: `src/app/home/home.component.html` and its component.
- Shared visual theme: `src/portfolio-theme.css` and `src/styles.css`.
- Navigation: `src/app/app.html` and `src/app/app.css`.
- Caricature: `public/assets/giorgi-and-cat.webp`, about 494 KB with transparency.
  Generated from the user's supplied photograph and optimized for web delivery.
  The original photograph is not included in the public assets.

The cat-review button, app filters, and future-project idea button run locally.
The future-project card is an idea placeholder, not a launched product. The page
uses a GitHub contact link instead of the former nonfunctional form and resume
button. It makes no API or third-party font requests and does not wait for remote
app manifests. HLS Player and Smart Todo List remain independently deployed.

## Validation

Run from the repository root with Node 24:

```bash
NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx run-many -t build,test,lint -p portfolio --parallel=2
```

Seven unit tests cover app links, portrait content, category filtering, the future
idea interaction, and the cat's review. Browser checks cover desktop and mobile
rendering, side-by-side desktop hero placement, loaded portrait, working app links,
all interactive controls, no horizontal overflow, zero API calls, and no failed
resources or uncaught browser errors. Reduced motion and keyboard focus are
supported; decorative artwork is hidden from assistive technology.

Cloud HTTPS browser checks fetch public assets with curl's normal TLS verification
and relay them into Chromium because its temporary profile does not trust the
cloud proxy CA. Certificate verification is not disabled.

## Deployment

Production output is `dist/apps/portfolio/`. A prebuilt bundle on the separate
`deploy/portfolio-artifacts` branch contains those files and
`deploy/install-portfolio.sh`. `.github/workflows/portfolio-deploy.yml` pins its
full artifact commit and SHA-256 checksum; update these pins after building and
testing a new release. That workflow runs on changes to its file on
`codex/portfolio-subdomains`, using the existing droplet SSH secrets.

The installer verifies the expected droplet, backs up Nginx privately, switches
the portfolio release under `/var/www/portfolio-live/current`, tests Nginx, and
compares the served index with the new release. Failed readiness restores the
previous configuration and release link. Old releases and backups remain under
`/var/www/portfolio-live/releases/` and `/var/www/portfolio-live/backups/`.

TLS, API proxy locations, HLS Player and Smart Todo List are preserved. The old
CI deployment script targets the former static directory; use this new workflow
for portfolio releases. The existing portfolio API route is unrelated to the
new page and still shares port 3000 with the Next.js application; do not start a
second server on that port without reviewing the server configuration.
