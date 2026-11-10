# Useful apps implementation plan

## Scope and delivery

Build and deploy all four ideas while keeping the retired MCP services disabled and the infrastructure API hidden. Public gallery will show HLS Inspector, Smart Todo, Angular Learning Lab, Developer Toolbox and Website Health. Shared account stays at auth.giorgi.app. No new paid service is required.

1. **Angular Learning Lab** (existing compiler host): responsive editor/preview/explanation layout; five lessons for signals, conditional rendering, lists, forms and component communication; editable examples; real Angular browser preview in an isolated frame; fix-it checks and hints; reactivity visualization; advanced AOT output; browser drafts, portable share links, account-owned cloud experiments and progress.
2. **Developer Toolbox** (`toolbox.giorgi.app`): JSON validation/format/minify, semantic diff, JSON-to-TypeScript, timestamp conversion, URL/query inspection and bounded regex testing. Inputs remain in the browser.
3. **Website Health** (`status.giorgi.app`): fixed first-party targets, real HTTP latency/status and TLS expiry checks, bounded persisted history, observed uptime and incidents, explicit stale/loading/unknown states. No arbitrary target fetching.
4. **HLS Inspector** (existing player host): retain playback; inspect playlists/renditions; show actual buffer, throughput, load timing, errors and live latency when available; manual/auto quality; redacted diagnostics export; clear CORS and native-player limitations.

## Integration and rollout

- Implement independent apps in parallel and validate feature behavior with deterministic local browser fixtures.
- Extend shared-account PKCE to the learning host using a distinct host-only app cookie. Enforce ownership and CSRF for cloud saves; keep guest experiments usable locally.
- Add new hostnames to the analytics registry, preserve private dashboard access, exclude utility inputs/code/media tokens from telemetry.
- Produce immutable, checksum-pinned prebuilt artifacts. Stage on disk under /var/tmp. Keep service/resource limits and rollback backups; preserve existing data and retired-host ACME routes.
- Create DNS and HTTPS for the two new hosts. Roll out identity support, active product builds, then public portfolio links.
- Verify actual live workflows from outside the droplet: sandbox preview/challenges/saves, toolbox examples, monitored service status, HLS fixtures, gallery and login, retired MCP 410 responses.

## Completion record

Implementation and local validation complete: five actual Angular starter/solution browser exercises, nine Lab unit/privacy checks, eight HLS unit cases plus real H264/AAC browser fixtures, seven real HTTP/TLS/history health tests, five toolbox core cases plus browser workflows, eight portfolio checks, and 33 shared-account unit/security cases plus actual three-role HTTP integration. Live rollout and verification follow from the pinned active-products workflow. Monitoring history starts at rollout; uptime is calculated only from recorded observations.


Live rollout completed successfully: https://github.com/giorgi0203/portfolio/actions/runs/42877931796 . All four independent public browser suites passed. Production shared-learning HTTPS checks passed including saved experiments, progress, ownership, CSRF, distinct host-only cookies and global logout. Toolbox and status DNS/TLS are live; retired MCP endpoints still return410. Product code, preview and utility inputs do not enter analytics. Public homepage links are the final rollout stage.
