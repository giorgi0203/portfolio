# Active products

The current products rollout replaces the retired full demo stack. It deploys Learning Lab on the existing compiler hostname, HLS Inspector on the existing player hostname, Developer Toolbox on toolbox.giorgi.app, and Website Health on status.giorgi.app. API remains infrastructure and MCP services remain disabled.

Build artifacts contain only static clients, the AOT compiler with its pinned runtime, and the small health service. `scripts/package-products.py` creates the immutable archive. Build and validate before packaging. The GitHub deployment workflow pins both artifact commit and SHA-256, stages the archive on disk under /var/tmp, and invokes `deploy/install-products.sh`. Service units and Nginx configs are backed up and the previous symlinks restored on failure. Existing SQLite user/task data and monitoring history are retained.

Shared auth/data support rolls out first from the Smart Todo repository. The learning role runs the same Next build at loopback3150, uses a distinct host-only cookie and owner-scoped tables, and permits only its account and learning APIs. Nginx forwards compiler-host /api/auth/* and /api/learning/* to that role. The browser preview remains separate from the server-side AOT compile route on3301.

New hosts receive their own two-name certificate; existing compiler and HLS certificates/ACME routes remain intact. The health service on3350 has a fixed target list and can write only /var/lib/giorgi-health. Its uptime starts with recorded observations, not historical estimates. Toolbox inputs and media tokens must never be included in analytics.

The existing 1GB droplet gets a disk-backed 1GB swap file if swap is absent, to absorb compiler and auth memory spikes without a paid server resize. Services retain individual memory limits. Application builds never run on the droplet.

After deployment, verify public account handoff/cloud saves, actual Angular preview/lesson checks, utility examples and regex timeout, real health data, HLS fixtures and redaction, mobile layouts, gallery links and shared login. Assert both retired MCP hosts still return410.
