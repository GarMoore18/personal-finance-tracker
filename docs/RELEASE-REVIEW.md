# Ledger release review

2026-11-27 · **Hold production release and real financial data.**

| Area | Verified | Before release |
| --- | --- | --- |
| Hosted database | The project has all three Ledger migrations. All five financial tables use owner-scoped row-level security and deny anonymous reads and writes. The net-worth view uses caller permissions. Anonymous requests to transactions and net worth returned HTTP 401. | Verify the owner can sign in and read an expense after re-authenticating in a separate browser session. Track this in #5 and #6. |
| Hosted authentication | The owner turned off public registration. The hosted access preflight confirmed that public registration and anonymous sign-in are disabled, and all six financial resources deny anonymous reads. | Verify that the administratively provisioned owner can sign in to the deployed app. Track this in #6. |
| Browser credentials | A build rejected a synthetic key shaped like a server secret. A build with a publishable fixture omitted an unrelated server-only environment marker. | Review the Netlify Production environment for the matching Supabase URL and publishable key. Keep privileged credentials outside the browser build. |
| Hosting | Deploy Preview #128 returned HTTP 200 with the Ledger build. The earlier unauthenticated request to the production origin returned HTTP 401. | Verify owner sign-in on the preview, then use an owner-authorized manual production deployment and retest. Track this in #9 and #6. |
| Recovery | The local PostgreSQL 17 rehearsal restored all financial tables with original IDs and verified isolation, balances and new snapshots. | Enable the private nightly schedule with failure notification and verify the first backup. Rehearse owner provisioning and restore on a fresh hosted destination before relying on that recovery path. |

The app has no public registration screen. Supabase Auth verifies the session and the database limits each authenticated identity to its own rows. Hosted Auth must also disable public account creation to preserve the single-owner operating model.

Supabase's security advisor reported that leaked-password protection is disabled. This feature requires Pro or above. Keep a unique, generated owner password on the current plan. [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

See the [deployment runbook](DEPLOYMENT.md), [backup runbook](BACKUP-RECOVERY.md), and [UX release pass](UX-REVIEW.md) for the remaining hosted and device checks.
