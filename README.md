# Giorgi's Portfolio

[giorgi.app](https://giorgi.app/) is a personal showcase for Giorgi Arabuli's apps and experiments. Its project gallery filters apps by category and links to each app and its source code. The homepage also includes an interactive cat review, a rotating preview of future project ideas, social links, and a project enquiry form.

The portfolio uses Angular 21, TypeScript, and Tailwind CSS 4 in an Nx 22 workspace. The project catalog, filters, and playful interactions run in the browser. The deployed site uses separate endpoints for enquiries and cookie-free page-view and outbound-click analytics.

## Featured apps

| App | What it does | Source |
| --- | --- | --- |
| [HLS Player](https://hls-player.giorgi.app/) | Plays HLS streams from a URL and lets viewers choose a quality when the stream offers multiple levels. Built with Angular and hls.js. | [Source in this repository](apps/hls-player/) |
| [Smart Todo List](https://smart-todolist.giorgi.app/) | A private workspace for projects and tasks with AI assistance for task breakdowns and project planning. Built with Next.js and React. | [Separate repository](https://github.com/giorgi0203/smart-todolist) |

## Local development

Use Node.js 24 and npm. The redesign source is on `codex/portfolio-subdomains`.

```bash
git clone --branch codex/portfolio-subdomains https://github.com/giorgi0203/portfolio.git
cd portfolio
npm ci --strict-ssl=true
npx nx serve portfolio --skipRemotes=hls-player
```

Open [http://localhost:4200](http://localhost:4200). To run HLS Player separately, use `npx nx serve hls-player` and open [http://localhost:4201](http://localhost:4201).

The repository also includes the original [Express API](apps/portfolio-api/src/main.ts), which is separate from the deployed enquiry and analytics endpoints. To inspect it locally, run `npx nx serve portfolio-api` and open [Swagger UI](http://localhost:3000/api/docs).

### Update the showcase

- Edit [`deployed-apps.ts`](apps/portfolio/src/app/deployed-apps.ts) to change the apps, categories, and links used by both the gallery and navigation.
- Edit the [home component](apps/portfolio/src/app/home/) for homepage copy and interactions, or the [theme stylesheet](apps/portfolio/src/portfolio-theme.css) for shared styles.

### Build and check

```bash
npx nx build portfolio --configuration=production
npx nx test portfolio --watch=false
npx nx lint portfolio
```

The production build is written to `dist/apps/portfolio/`.

## Deployment

GitHub Actions installs the static portfolio on a DigitalOcean droplet served by Nginx. The [portfolio workflow](.github/workflows/portfolio-deploy.yml) runs when its workflow file changes on `codex/portfolio-subdomains`. It downloads a prebuilt bundle pinned to a commit on `deploy/portfolio-artifacts` and verifies its SHA-256 checksum before installation. A new release requires a validated build and updated artifact pins. See the [portfolio deployment guide](docs/PORTFOLIO_DEPLOYMENT.md) for the bundle layout and installation process.

[HLS Player](.github/workflows/hls-player-deploy.yml) and [Smart Todo List](.github/workflows/smart-workspace-deploy.yml) deploy through separate workflows.

## Shared sign-in and cross-project analytics

Use Command+. (Control+. on Windows/Linux) or the Owner sign-in link on the homepage to open the shared Giorgi account dialog. Authentication runs at `auth.giorgi.app` in a separate service. Existing Smart Todo accounts continue to work. The main page embeds the trusted auth UI and opens `https://auth.giorgi.app/analytics` after sign-in; analytics remain restricted to the configured owner's verified account.

Smart Todo uses a short-lived authorization code with PKCE and a host-only app cookie. HLS can display the shared account while keeping playback public. The dashboard combines page-view/referrer/outbound-click counts across the main site, Smart Todo, HLS and auth, with per-site filters. Older main-site counts are retained; subdomain counts begin with this release. No tracking cookies or AI requests are used for analytics. Do Not Track and Global Privacy Control are respected.

The shared service source and its protocol/deployment notes live in the [Smart Todo repository](https://github.com/giorgi0203/smart-todolist). New server apps need an explicitly registered client and exact callback URL; the identity cookie is never shared across `.giorgi.app`.
