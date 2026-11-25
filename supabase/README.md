# Supabase migrations

See [database setup](../docs/DATABASE.md) for local and hosted environments.

New owners receive the prototype's 12 flat expense categories, with default colors and icon identifiers. The migration fills in missing defaults for existing owners and preserves existing matching names. Category edits retain the original category ID, which preserves the link to existing expenses. Categories with expense references must be reassigned before deletion.

Check the defaults in a disposable local database:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/checks/default_categories.sql
```
