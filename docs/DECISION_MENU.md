# Decision Department: photo menu planner

## Flow

1. Take or upload a menu photo, or enter dishes manually.
2. Sign in with the shared Giorgi account and verify email to scan. The browser compresses the photo; the server asks OpenAI to extract names, prices and categories.
3. Review the editable results. Missing or unclear prices stay unselected until corrected. Confirm one currency; no exchange rates are inferred.
4. Set a total group budget and 1–12 people. The planner selects exactly one eligible dish per person, allowing repeated orders and showing quantities, total and remaining budget.
5. Shuffle up to three distinct combinations using the confirmed menu. This does not call AI. Add a combination to a joined room explicitly if the group wants to vote or spin.

Prices use integer minor units. If the cheapest eligible dishes cannot cover everyone, the planner reports the minimum required budget. Displayed totals exclude additional service charges, taxes and tips that the user has not included. Category suggestions are editable and do not establish allergy safety.

## Privacy and limits

Raw photos are neither written to disk nor placed in browser storage. Edited menu drafts may stay in the current browser tab. A successful scan is cached privately in server memory for ten minutes to avoid charging another attempt for an identical photo. Menu contents reach a shared room only through the explicit Add action.

Scan attempts are limited to three per account and thirty globally in a rolling 24-hour window, one per minute per account, with one active scan per account and two globally. Limits persist in the existing SQLite database and count provider failures. AI calls have a 25-second deadline, bounded inputs and responses, and no automatic paid retries. Manual entry and reshuffling need no account or paid requests.

The existing OpenAI key is copied privately on the server into a service-readable configuration file. The browser never receives it. Sign-in uses a registered PKCE client, host-only HttpOnly cookies and app-scoped central grants; each scan rechecks the live account and verification status. Grants remain bound to the exact identity session so a revoked grant cannot revive after logging in again.

## Validation and release

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx test decision-department
node_modules/.bin/tsc -p apps/decision-department/tsconfig.json
NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx build decision-department
node scripts/decision-menu-browser.cjs
NEW_APPS_ONLY=decisions node scripts/new-apps-browser.cjs
```

The identity repository adds grant, revocation and PKCE tests. Its build is packaged with the Decision build. The scoped installer updates only Decision's service/site and the identity service's current release, with file backups and a rollback trap. Existing room/account databases receive additive tables. Automatic rollback restores code/configuration and leaves current user data in place; consistent pre-release database backups are retained for manual recovery.

Production verification creates a temporary synthetic account, exercises actual shared sign-in and live email-verification checks, sends one synthetic menu photo to the real AI service, checks duplicate-photo caching and global logout, then removes the account. The workflow also repeats public manual-budget and room browser journeys over HTTPS.
