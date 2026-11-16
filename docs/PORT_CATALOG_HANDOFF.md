# Port catalog reconciliation

Verified 2026-11-17 (Asia/Tbilisi). This is a proposal and durable handoff; no Port, DNS, deployment, or environment configuration was changed.

## Verified access and current state

- GitHub GET /user authenticated as giorgi0203. GET /repos/giorgi0203/portfolio returned admin/push/pull access.
- DigitalOcean GET /v2/domains returned giorgi.app. Candidate application hostnames have A records pointing to 138.68.64.163. This establishes domain read access, not write permission or application health.
- Port EU tools authenticated to giorgi-app as Admin and successfully listed blueprints.
- Existing pages: Services (`services`, organization visibility) and App Overview (`app_overview`, organization visibility).
- Existing service entities: portfolio -> githubRepository/portfolio; smart-todolist -> githubRepository/smart-todolist. There are 44 repository entities.
- Reuse github-ocean (SaasOAuth2). Its metric is pending; startedAt, endedAt, syncType and counters are null. Records being present does not establish a completed integration sync. Do not create a replacement integration or claim sync health.
- Existing environments are production, staging and test. These represent runtime environments, not Cloud coding toolchains.
- Portfolio main is 7287214a681c9e9956900faf9ff60d12cdd30bee (merged PR #2). Latest Portfolio CI, Portfolio deployment, and HTTP Playground/Decision Department deployment runs succeeded. No open PRs were returned for either repository.
- Smart Todo main is 6c744eba1da8969a0f456665198df62e4818f06a; latest Workspace checks succeeded. Those checks alone do not prove deployment.

## Proposed service reconciliation

Reuse the service blueprint and the existing two matching service identifiers. Keep repository records separate. Add optional service properties for source directories, public URL, project group, deployment target, observed HTTP status, health observation time, active work links, and durable handoff URL. Relate runtime environments explicitly; keep repository metadata in the existing github_repository relation and mirrors. Inspect integration mappings before changing service identifiers or PR/workflow relations: repository-wide delivery metrics must not be attributed to each app as though they were app-specific.

| Service | Repository | Source | Public host | Observed HTTPS |
| --- | --- | --- | --- | --- |
| Portfolio (reuse portfolio) | portfolio | apps/portfolio | giorgi.app | 200 |
| Shared identity and owner analytics | smart-todolist | Shared src/ build, APP_ROLE=identity | auth.giorgi.app | Unverified: proxy CONNECT 403 |
| Smart Todo (reuse smart-todolist) | smart-todolist | Shared src/ build, task role | smart-todolist.giorgi.app | 200 |
| HLS Inspector | portfolio | apps/hls-player | hls-player.giorgi.app | 200 |
| Angular Learning Lab | portfolio | apps/angular-compiler-ui; apps/angular-compiler-api | angular-compiler.giorgi.app | Unverified: proxy CONNECT 403 |
| Developer Toolbox | portfolio | apps/dev-toolbox | toolbox.giorgi.app | Unverified: proxy CONNECT 403 |
| Website Health | portfolio | apps/site-health | status.giorgi.app | Unverified: proxy CONNECT 403 |
| HTTP Playground | portfolio | apps/http-playground | http-playground.giorgi.app | Unverified: proxy CONNECT 403 |
| The Decision Department | portfolio | apps/decision-department | decisions.giorgi.app | Unverified: proxy CONNECT 403 |

HTTP 200 is an availability observation, not a functional test. Proxy failures are not evidence of an origin outage. Smart Todo README documents independent giorgi-identity and task runtime services sharing source and SQLite storage. Do not expose analytics data in organization dashboards.

## Single overview proposal

Reuse App Overview with its existing organization visibility. Replace the repository-level interpretation of its app count with an accurately labeled service count once reconciliation is applied. Keep a separate repository count. Show one service table with repository/source links, project group, runtime environment, deployment target, public URL, active PR/task links, observed health with timestamp, and latest committed handoff link. Add integration freshness as a separate indicator: pending/unknown until a completed sync is observed.

Use Web Lab and Game Development as project groups, separate from runtime environments and built-in ownership. Reuse built-in team ownership if real teams are configured; do not invent teams. Potential game repository GeneralsGameCode exists in Port, but engine, active scope, and game ownership remain unverified. Inspect repository manifests before assigning it to Game Development or choosing an engine-specific toolchain.

## Next implementation steps

1. Inspect the existing github-ocean mapping and sync diagnostics through supported integration tools; preserve repository ingestion and existing service links.
2. Extend the service schema with the optional properties and runtime relation described above, then upsert the seven missing app services and enrich the two existing ones.
3. Update the existing Services table and App Overview to show those fields. Preserve current organization visibility; only show public metadata and private analytics entry links, never analytics contents.
4. Recheck the six proxy-blocked hosts from an authorized network or the existing deployment host before assigning health. Use application-specific evidence before recording successful deployments.
5. Discover the game engine and active repository scope, then choose a separate game coding environment if needed. Keep the compatible shared Web coding environment.

## Constraints to preserve

The animated cat stays parked. example-mcp and mcp remain retired; their DNS records alone are not grounds to restore them. Portfolio API stays hidden from the gallery. Owner analytics stay private. Do not republish or reconfigure the reusable coding environment. Never include secrets, OAuth codes, room credentials, or passwords in handoffs.

## Evidence links

- Portfolio repository: https://github.com/giorgi0203/portfolio
- Smart Todo repository: https://github.com/giorgi0203/smart-todolist
- Merged PR: https://github.com/giorgi0203/portfolio/pull/2
- Portfolio CI: https://github.com/giorgi0203/portfolio/actions/runs/43098723926
- Portfolio deployment: https://github.com/giorgi0203/portfolio/actions/runs/43098723764
- HTTP/Decisions deployment: https://github.com/giorgi0203/portfolio/actions/runs/43098724034
- Workspace checks: https://github.com/giorgi0203/smart-todolist/actions/runs/42876775912

Original session handoff was /workspace/PORT_PROJECT_HANDOFF.md. A path or chat URL alone does not transfer workspace state to another session; use this committed document and live read-only verification.
