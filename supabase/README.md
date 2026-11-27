# Supabase migrations

See [database setup](../docs/DATABASE.md) for local and hosted environments.

New owners receive the prototype's 12 flat expense categories, with default colors and icon identifiers. The migration fills in missing defaults for existing owners and preserves existing matching names. Category edits retain the original category ID, which preserves the link to existing expenses. Categories with expense references must be reassigned before deletion.

Run the financial integrity checks after applying migrations to a disposable local database. The checks verify category defaults, owner isolation, expense create/update/delete, monthly balance snapshots, and the net-worth calculation:

```sh
for check in supabase/checks/*.sql; do
  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f "$check" || exit 1
done
```
