# Current net worth

Read the signed-in owner's current totals from `public.current_net_worth`. The view uses the caller's permissions and account row-level security. It returns one row for an owner with active accounts and no row when all accounts are missing or archived.

Sum each active asset balance once. Subtract the sum of active liabilities, including both credit cards and loans. A negative asset represents an overdraft and a negative liability represents a credit. Account groups, expenses, and historical snapshots make no contribution to current totals.

The API returns assets, liabilities, and net worth as decimal strings so a browser can preserve exact amounts. Use decimal-aware formatting or integer cents. Dashboard and Accounts should share this calculation.

After applying migrations on a disposable local stack, run:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/checks/current_net_worth.sql
```
