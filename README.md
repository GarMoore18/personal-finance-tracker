# Personal Finance Tracker (Ledger)

A single-page expense tracker. No build step, no framework.

- Accounts with opening balances and "as of" dates
- Pending vs. cleared transactions, with projected balances
- Transfers between accounts, custom categories with optional budgets
- Excel / CSV / JSON export
- Optional Google Sheets backend (via Apps Script)

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app (UI + logic) |
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

## Data

Without sync, data lives in the browser's localStorage. Use Settings → Backup JSON regularly.

## Tests

Headless-browser tests cover balances, pending/cleared, transfers, validation and import hardening:

```
pip install playwright && playwright install chromium
python3 tests/test_ledger.py        # set CHROME_PATH to use an existing Chrome
```
