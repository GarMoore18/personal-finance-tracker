# Personal Finance Tracker (Ledger)

A phone-first spending tracker you can install on your iPhone Home Screen. No build step, no framework.

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
| `index.html` | The whole app (UI + logic) |
| `manifest.webmanifest`, `sw.js`, `icons/` | Installable app (PWA) and offline cache |
| `docs/REQUIREMENTS.md` | Requirements, design decisions, phases, backlog |
| `apps-script/Code.gs` | Google Apps Script backend for Sheets sync |
| `netlify.toml` | Netlify config (static site, no build) |

## Deploy

Netlify → Add new site → Import from Git → pick this repo. Leave build command empty and publish directory as `.`.
Every push to `main` redeploys.

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

Headless-browser tests (iPhone viewport) cover the keypad flow, pending/clear, as-of dates, transfers, investments, snapshots, reconcile, layout and import hardening:

```
pip install playwright && playwright install chromium
python3 tests/test_ledger.py        # set CHROME_PATH to use an existing Chrome
```
