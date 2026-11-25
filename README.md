# Personal Finance Tracker (Ledger)

A phone-first personal finance tracker. The production site is the root single-file prototype. The replacement app is under development in `app/` as a mobile-first PWA built with Vite, TypeScript, React, and browser-side Supabase. See [app setup](app/README.md) and [architecture decisions](docs/decisions/) for details; keep the prototype working until migration is ready.

## Current production prototype

The root `index.html` app has no build step or framework. It can be installed from Safari on an iPhone and works offline.

- Bottom tab bar (Home, Activity, +, Accounts, More) and an amount-first keypad for adding in ~3 taps
- Home cards you can hide and reorder: spent vs last month's pace, top categories, pending, accounts
- Pending items keep one record: tap Clear and adjust the final amount, so nothing is counted twice
- Accounts with an "as of" date; older transactions are not counted again
- Investment accounts tracked by value (never counted as spending), monthly snapshots, and Reconcile against your bank
- Transfers, custom categories with optional monthly limits
- Excel / CSV / JSON export; optional Google Sheets backend (via Apps Script)
- Works offline (service worker)

## Files

| File | Purpose |
|---|---|
| `index.html` | The production prototype (UI + logic) |
| `app/` | Vite, TypeScript, and React replacement app in development; see `app/README.md` |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installable app (PWA) and offline cache |
| `docs/REQUIREMENTS.md` | Requirements, design decisions, phases, backlog |
| `docs/decisions/` | Recorded architecture, data, and hosting decisions |
| `apps-script/Code.gs` | Google Apps Script backend for Sheets sync |
| `netlify.toml` | Netlify config (static site, no build) |

## App under development

The Vite app in `app/` is not the production site yet. Follow [its setup guide](app/README.md) for local development and public Supabase configuration. CI builds it with placeholder values and exercises sign-in through a synthetic browser test; never use real credentials or financial data in CI.

## Hosting and deploys

The prototype is hosted on Netlify Free. Production deploys are manual; pushes to `main` are skipped by the `ignore` rule in `netlify.toml`. Do not remove that rule or trigger a production deploy without the owner's request. See [hosting decision](docs/decisions/0003-hosting.md).

## Google Sheets sync

1. Create a Google Sheet → Extensions → Apps Script → paste `apps-script/Code.gs`.
2. Change `TOKEN` to a long random string.
3. Deploy → New deployment → Web app → Execute as **Me**, access **Anyone**.
4. In the app: Settings → Google Sheets sync → paste the web app URL and the same token.

The token is the only protection for the sheet — never commit your real token or URL to this repo.

## Install on iPhone

Open the site in Safari, tap Share, then Add to Home Screen.

## Data

Without sync, data lives in the browser's localStorage. Use Settings → Backup JSON regularly.

## Tests

Headless-browser tests (iPhone viewport) cover the production prototype's keypad flow, pending/clear, as-of dates, transfers, investments, snapshots, reconcile, layout and import hardening. CI also builds the app with placeholder Supabase configuration and runs its synthetic sign-in browser test:

```
pip install playwright && playwright install chromium
python3 tests/test_ledger.py        # set CHROME_PATH to use an existing Chrome
```

Pull requests that change behavior should update or add a test and keep the relevant decision or requirements documentation current.
