# Ledger React app

The replacement app lives in this directory. Run these commands from the repository root with Node.js 22.12+ or 24+.

```sh
npm ci --prefix app
npm run dev --prefix app
```

The shell includes responsive navigation, shared surface and typography tokens, and a System, Light, or Dark preference saved on this device. Hash navigation supports direct links and browser back without a host rewrite. The static build is written to `app/dist`.

Owner sign-in uses a Supabase email and password account created administratively. Workflow implementation and cloud data access are tracked in GitHub. The existing Netlify project serves the root prototype until the replacement is ready and the deployment changes in #9.

## Public Supabase configuration

Copy `.env.example` to `app/.env.local` and set:

| Variable | Value |
|---|---|
| `LEDGER_SUPABASE_URL` | Local API origin from `supabase status`, or the HTTPS project origin |
| `LEDGER_SUPABASE_PUBLISHABLE_KEY` | The matching `sb_publishable_` key |

Set the same variables as Netlify build environment variables when #9 switches the build to this app. Scope development and preview builds to a test project and production to its own project. Both values are public browser configuration.

Keep Supabase secret keys, service-role keys, database passwords, and provider tokens in trusted server-side configuration. Vite injects only the Supabase URL and publishable key from the variables above. Automatic environment-variable exposure is disabled.

A production build fails on missing or invalid public configuration without printing values. An unconfigured local dev server shows setup instructions and keeps Ledger locked. For a configured local preview:

```sh
npm run build --prefix app
npm run preview --prefix app
```

## Owner sign-in

Apply the [database setup](../docs/DATABASE.md) in a local Supabase stack. Create the owner in local Studio's Authentication dashboard, confirm the account, and use its email and password on the Ledger sign-in screen. The application verifies the session with Supabase before displaying the shell. Sign out from More on shared devices.

Keep self-registration and anonymous sign-ins disabled in Supabase. The shell gate controls navigation and PostgreSQL row-level security controls data access. Verify both with synthetic accounts before connecting a hosted project.

Accounts can be grouped, classified as assets or liabilities, and archived for safekeeping; account history is preserved, and new accounts require a starting balance observation. The account management browser check uses a synthetic Auth and REST fixture for UI behavior. It does not exercise RLS; the Supabase SQL workflow owns those checks.

```sh
LEDGER_SUPABASE_URL=https://ledger-test.supabase.co LEDGER_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test-only npm run build --prefix app
python3 tests/test_owner_sign_in.py
```
