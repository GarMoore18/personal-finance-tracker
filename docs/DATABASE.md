# Database development

[ADR 0004](decisions/0004-core-financial-model.md) defines the financial model. Supabase owns persistence. Keep local development and hosted production separate.

## Local setup

Install Docker, the Supabase CLI (3.4 or later for the checked-in config), and the PostgreSQL client. From the repository root:

```sh
supabase start
supabase db reset
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/checks/financial_schema.sql
```

The SQL check creates two synthetic owners, verifies permissions and financial invariants, and rolls back its fixtures. Run it against a disposable local database. It uses the standard local CLI connection string. The app's client setup is tracked in #6 and #7.

Public and anonymous sign-ups are disabled in local config. Use the opt-in persistence check on a disposable stack with Playwright and Chromium installed. Set `LEDGER_SUPABASE_URL` to the loopback API URL on `127.0.0.1` and `LEDGER_SUPABASE_PUBLISHABLE_KEY` to its publishable key. Set `LEDGER_TEST_SUPABASE_SERVICE_ROLE_KEY` from the same stack for the Python test process only. Keep the service-role key out of app build inputs and committed files.

```sh
npm ci --prefix app
npm run build --prefix app
python3 tests/test_supabase_persistence.py
```

The test creates two synthetic accounts through Auth Admin, saves an expense in a phone-sized browser context, and reads it after signing in from a fresh desktop context. A different user sees an empty Activity page, and anonymous Data API requests are denied. The fixtures stay in the disposable stack until it is reset.

## Hosted setup

Use a designated Supabase project for Ledger. Confirm the database major version, link the CLI to the designated project, review pending changes with `supabase db push --remote --dry-run`, and apply reviewed migrations with `supabase db push --remote`. Configure Auth in the hosted project separately. Create the owner administratively, disable public and anonymous sign-ups, and verify authentication and isolation before entering data. Keep the backups and recovery conditions in [ADR 0001](decisions/0001-database-auth-storage.md).

Use the [backup and recovery runbook](BACKUP-RECOVERY.md) to configure the nightly financial export and rehearse recovery before entering real data.
