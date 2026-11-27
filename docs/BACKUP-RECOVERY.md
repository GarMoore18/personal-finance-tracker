# Ledger backup and recovery

The project owner runs and monitors the backup. Export the Ledger tables every night after use and before a schema change or production cutover. Keep 14 daily copies and four weekly copies on encrypted, access-controlled storage outside the database provider and this repository. Verify the latest run each day and rehearse a restore on a disposable database quarterly and after a storage or schema change. If a nightly run fails, keep the last working copy and investigate before allowing it to expire.

A successful nightly backup limits ordinary data loss to about one day. Restore time depends on provisioning a compatible destination and verifying it. A prolonged failure or missed backup can increase data loss. Record the date and outcome of each rehearsal.

## Export financial records

Use a PostgreSQL client compatible with the project database version. Configure a private libpq service called `ledger-source` with the direct or session-pooler connection from Supabase, TLS enabled, and credentials stored outside Git. Use an existing encrypted backup directory and a dated backup folder. The archive is a consistent snapshot of all five Ledger tables, including original owner and category IDs.

```sh
set -eu
umask 077
backup_dir=/path/to/encrypted/ledger-backups
backup_date=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_dir/ledger-financial-$backup_date.sql"
pending_file=$(mktemp "$backup_dir/ledger-financial.XXXXXXXX")
if pg_dump --dbname=service=ledger-source --data-only --no-owner --no-privileges --strict-names \
  --table=public.account_groups --table=public.accounts --table=public.balance_snapshots \
  --table=public.categories --table=public.transactions --file="$pending_file"; then
  mv "$pending_file" "$backup_file"
  (
    cd "$backup_dir" || exit 1
    sha256sum "$(basename "$backup_file")" > "$(basename "$backup_file").sha256"
  )
else
  rm -f "$pending_file"
  exit 1
fi
```

Keep the checksum, the source owner's UUID from Supabase Authentication, and the last applied Ledger migration version with the encrypted backup. Check the source and destination migration versions before recovery. Configure the owner's private scheduler and failure notification before entering real data, as required by [ADR 0001](decisions/0001-database-auth-storage.md).

## Restore to a fresh destination

1. Verify the checksum in the backup directory with `sha256sum --check <backup-file>.sha256`. Use a backup whose origin you trust because restore executes SQL from the file.
2. Prepare a fresh Supabase project or disposable local stack on the same PostgreSQL major version. Apply Ledger migrations through the version recorded with the backup. Leave the destination disconnected from the production app.
3. Provision the owner administratively with the **original UUID** and a fresh password. The Auth Admin endpoint `POST /auth/v1/admin/users` accepts the owner UUID as `id`. Call it from a trusted server-side environment with the destination's admin credential. Confirm the returned ID before continuing. Owner provisioning seeds the 12 default categories.
4. Configure a private libpq service named `ledger-restore` for the destination. From the repo root, run the restore with the original owner UUID and the absolute path to the verified SQL backup.

```sh
psql --no-psqlrc --dbname=service=ledger-restore \
  --set=owner_id='<original-owner-uuid>' \
  --set=backup_file='/absolute/path/to/verified-ledger-financial.sql' \
  --file=supabase/recovery/restore-ledger-data.sql
```

The script requires one matching Auth owner, no financial rows, and the untouched seeded categories. It restores the original category IDs and snapshots in one transaction. Foreign keys remain enforced.

5. In the destination only, verify owner sign-in, compare counts and representative balances, expenses, categories, and monthly snapshots against the source, and confirm an unauthenticated client has no data access. Check the net-worth totals and confirm a new balance observation creates its monthly snapshot. Record the tested date and result. Plan the production cutover separately after verifying the replacement.

## Recovery scope

The export covers Ledger's financial tables. Auth sessions, passwords, project settings and secrets, and Storage objects require separate recovery. Re-create project configuration from [database setup](DATABASE.md), use fresh credentials, and consult Supabase's [project backup and restore documentation](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) for provider-level recovery. Add independent object backups before storing receipts or statements.

The 2026-11-27 rehearsal used disposable PostgreSQL 17 databases and synthetic Auth identities. All five tables matched after restore, including the renamed category and historical balances. The rehearsal also checked rollback after a corrupt dump, refusal of a populated destination, net-worth totals, owner isolation, and new snapshots after recovery. Hosted Auth provisioning and the owner's scheduled backup still need verification before real data.
