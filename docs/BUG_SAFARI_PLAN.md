# Bug Safari — plan and release checklist

## Goal

A small debugging game at https://bug-safari.giorgi.app/: reproduce a bug, edit real JavaScript, run observable tests, understand the repair, and collect the specimen in a local field journal. The first release is a static browser app with no signup, AI calls, or server-side code execution.

## First expedition: six specimens

1. Off-by-one inventory/pagination boundaries.
2. Numeric sorting that accidentally compares strings.
3. Shared-array mutation that changes the original inventory.
4. Closure capture that gives callbacks the wrong value.
5. Out-of-order asynchronous responses that overwrite newer results.
6. Event-listener cleanup that retains old subscriptions.

Each includes a reproducible broken starter, editable code, actual tests with expected/observed results, a small visual specimen preview, three progressive hints, a worked solution and a why-it-happened explanation. Passing current tests adds a field-journal badge. Revealing a solution is recorded as a guided discovery when its tests pass.

## Implementation order

1. Challenge definitions and deterministic test harness; prove every starter fails and every reference repair passes.
2. Disposable Web Worker execution with bounded messages, syntax/runtime error reporting, a parent-enforced timeout and cancellation on challenge change.
3. Responsive field-guide UI: expedition list/filter, prominent code editor, run/reset controls, live observations, hints and local progress.
4. Integration: portfolio card and static crawler link; retain the existing hidden/retired apps and parked mascot choices.
5. Deployment: scoped static release, DNS and HTTPS for this host only, security headers and rollback, then public browser verification before the eight-app portfolio release.

## Execution boundary

User snippets execute only in a disposable browser worker. The main app never evaluates them. The worker response has a dedicated Content-Security-Policy that blocks network connections, imported scripts and nested workers while allowing its local test evaluator. The parent terminates runaway work. This is a learning tool, not an anti-cheat system or a hard memory-isolation service. Code and progress stay in the browser; the static server does not execute user snippets.

## Acceptance checks

- All six real broken starters fail; all six reference repairs pass.
- Wrong edits produce real failed assertions; syntax/runtime failures are readable.
- An infinite loop is terminated and the page remains usable.
- The deployed worker's CSP blocks fetch/importScripts and the main page does not allow eval.
- Switching expeditions/resetting cannot apply an old worker result to the new challenge.
- Editing during a run cancels that run; old code cannot earn a discovery for the visible draft.
- Hints, solution reveal, journal reload, keyboard flow, reduced motion and a 390px viewport work.
- Existing portfolio lint/tests/build and SEO/consent checks pass with eight visible cards.
- Public HTTPS browser journeys and existing production host checks pass.

## Deferred ideas

Later expeditions may add DOM/CSS bugs in a separate opaque-origin iframe runner, shared challenge links, optional shared-account progress, difficulty paths and user-authored challenges. They are not prerequisites for this first release.

## Verification

Run these against the production bundles before packaging a release:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx run-many -t lint,test,build -p portfolio,bug-safari --parallel=2
node_modules/.bin/tsc -p apps/bug-safari/tsconfig.json
node scripts/bug-safari-browser.cjs
node scripts/seo-analytics-browser.cjs
bash -n deploy/install-bug-safari.sh
```

The release workflow repeats the game journeys over public HTTPS before publishing the updated portfolio. It pins the built artifacts by immutable Git commit and SHA-256, retains the previous static release and Nginx configuration for rollback, and checks the existing production hosts after installation.
