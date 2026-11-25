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

Create an owner for manual testing through local Studio or Supabase's Auth Admin API. Public and anonymous sign-ups are disabled in local config. Create another session against the same local stack and confirm data is present after re-authentication once the authenticated UI is available.

## Hosted setup

Use a designated Supabase project for Ledger. Confirm the database major version, link the CLI to the designated project, review pending changes with `supabase db push --remote --dry-run`, and apply reviewed migrations with `supabase db push --remote`. Configure Auth in the hosted project separately. Create the owner administratively, disable public and anonymous sign-ups, and verify authentication and isolation before entering data. Keep the backups and recovery conditions in [ADR 0001](decisions/0001-database-auth-storage.md).
