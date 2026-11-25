# Ledger React app

The active application lives in this directory. Run these commands from the repository root with Node.js 22.12+ or 24+.

```sh
npm ci --prefix app
npm run dev --prefix app
```

The shell includes responsive navigation, shared surface and typography tokens, and a System, Light, or Dark preference saved on this device. Hash navigation supports direct links and browser back without a host rewrite. The static build is written to `app/dist`.

## Netlify deployment

The root `netlify.toml` builds from this directory with `npm run build` and publishes `dist/`. Netlify uses Node 22.12.0. Production builds from `main` remain skipped until the owner requests a manual deploy.

In Netlify Project configuration → Environment variables, configure these for each deploy context:

- **Deploy Previews:** URL and publishable key for a test Supabase project.
- **Production:** URL and publishable key for the production Supabase project.

The build intentionally fails when either public setting is missing or invalid. Keep values out of Git so each context can use its own project. Never put Supabase secret keys, service-role keys, database passwords, or provider tokens in these variables.

## Public Supabase configuration

Copy `.env.example` to `app/.env.local` and set:

| Variable | Value |
|---|---|
| `LEDGER_SUPABASE_URL` | Local API origin from `supabase status`, or the HTTPS project origin |
| `LEDGER_SUPABASE_PUBLISHABLE_KEY` | The matching `sb_publishable_` key |

Vite injects only the Supabase URL and publishable key from these variables. Automatic environment-variable exposure is disabled. An unconfigured local dev server shows setup instructions and keeps Ledger locked.

## Owner sign-in

Apply the [database setup](../docs/DATABASE.md) in a local Supabase stack. Create the owner in local Studio's Authentication dashboard, confirm the account, and use its email and password on the Ledger sign-in screen. The app verifies the session with Supabase before showing the shell. Sign out from More on shared devices.

Keep self-registration and anonymous sign-ins disabled. PostgreSQL row-level security controls data access. Verify access and persistence before using real financial data.

Accounts can be grouped and archived for safekeeping. Choose asset or liability when creating an account. Account history is preserved, and new accounts require a starting balance observation. Home shows spending for the device’s current month, net worth and up to four active account balances, and the five latest expenses grouped by day. Use Add to record an expense. Open Activity and select its month to see daily totals and expense details. Edit an expense directly in its day. Deleting requires a second confirmation, and the selected month stays in view.

The browser checks use synthetic Auth and REST fixtures. Hosted row-level security requires separate verification.

```sh
LEDGER_SUPABASE_URL=https://ledger-test.supabase.co LEDGER_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test-only npm run build --prefix app
python3 tests/test_owner_sign_in.py
```
