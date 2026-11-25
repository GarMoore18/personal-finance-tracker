# 0001: Database, authentication, and private file storage

- **Status:** Accepted
- **Date:** 2026-11-24
- **Decided by:** Repo owner, after review in issue #4
- **Related:** #4 (evaluation), #70 (hosting, still open), #3 (architecture, still open), #5 to #8 (implementation)

## Decision
Use **Supabase** for the database (PostgreSQL), authentication, and private file storage (receipts, images, statements).

This record does **not** decide hosting (#70) or the frontend stack (#3). Nothing has been provisioned yet; provisioning is part of #5.

## Why
- Relational data (accounts, transactions, snapshots, reports) fits PostgreSQL, with exact decimal money types and constraints.
- One provider covers database, login, and private storage, so fewer pieces to secure than Neon plus separate auth and storage.
- Row-level security (RLS) keeps authorization in the database, so a leaked frontend key cannot read data it should not.
- Starts at $0. PostgreSQL keeps the exit path simple (standard dump and restore).

## Conditions before any real financial data
1. **Backups.** The Free plan has no automatic backups (see the comparison in #4). Before real data, either upgrade to a plan with backups or run our own scheduled export, stored privately and never in this public repo, and complete a restore test (#8).
2. **Access.** Login and RLS on every table are in place and tested. Disable public sign-ups once the owner account exists.
3. **Inactivity.** Know what happens to a Free project after a quiet period before relying on it.
4. **Secrets.** Only the public anon key and project URL appear in frontend code. The service-role key lives server-side only.

## Alternatives considered
- **Neon + separate auth and storage:** cheaper on database size, more integration and security work. Runner-up.
- **Firebase / Firestore:** document model is a poor fit for relational reporting.
- **AWS (RDS, DynamoDB, S3):** more operational work than a single-user app needs. S3 remains an option for receipts if Supabase storage proves insufficient.

## Upgrade triggers
- Real financial data without an independently tested restore.
- Receipt or statement files outgrowing free storage.

## Exit path
Standard PostgreSQL: export with a regular dump and restore into another Postgres host. Keep schema and migrations in this repo so the schema is never only in a provider dashboard.

## Initial data model
See [ADR 0004](0004-core-financial-model.md) for the accepted financial model and invariants.

## Migration approach
- SQL migrations live in `supabase/migrations/`, committed and reviewed like code (Supabase CLI).
- Separate development and production environments (separate projects if the plan allows, otherwise local development with the CLI).
- Default categories are seeded by a migration.
- The prototype's data moves over with a one-time, reviewed import script from the JSON backup. The prototype stays in place until the import is verified.
