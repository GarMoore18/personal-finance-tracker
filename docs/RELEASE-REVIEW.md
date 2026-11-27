# Ledger release review

2026-11-27 · **Hold production release and real financial data.**

| Area | Verified | Before release |
| --- | --- | --- |
| Hosted database | The project has all three Ledger migrations. All five financial tables use owner-scoped row-level security and deny anonymous reads and writes. The net-worth view uses caller permissions. Anonymous requests to transactions and net worth returned HTTP 401. | Verify the owner can sign in and read an expense after re-authenticating in a separate browser session. Track this in #5 and #6. |
| Hosted authentication | Anonymous sign-in is disabled. The hosted Auth settings report that public registration is enabled. | Disable **Allow new users to sign up** in the hosted project. Confirm the public Auth settings report that registration is disabled, then verify the administratively provisioned owner can sign in. Track this in #6. |
| Browser credentials | A build rejected a synthetic key shaped like a server secret. A build with a publishable fixture omitted an unrelated server-only environment marker. | Review the Netlify Production environment for the matching Supabase URL and publishable key. Keep privileged credentials outside the browser build. |
| Hosting | GitHub reported a successful Netlify Deploy Preview. Unauthenticated requests to the preview and production origins returned HTTP 401. | Verify the protected preview build and owner sign-in, then use an owner-authorized manual production deployment and retest. Track this in #9 and #6. |
| Recovery | The local PostgreSQL 17 rehearsal restored all financial tables with original IDs and verified isolation, balances and new snapshots. | Enable the private nightly schedule with failure notification and verify the first backup. Rehearse owner provisioning and restore on a fresh hosted destination before relying on that recovery path. |

The app has no public registration screen. Supabase Auth verifies the session and the database limits each authenticated identity to its own rows. Hosted Auth must also disable public account creation to preserve the single-owner operating model.

Supabase's security advisor reported that leaked-password protection is disabled. This feature requires Pro or above. Keep a unique, generated owner password on the current plan. [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

See the [backup runbook](BACKUP-RECOVERY.md) and [UX release pass](UX-REVIEW.md) for the outstanding rehearsal and device checks.
