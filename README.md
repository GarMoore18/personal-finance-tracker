# Personal Finance Tracker (Ledger)

Ledger is a phone-first personal finance app. The active React, TypeScript, and Vite application lives in `app/` and uses Supabase for authentication and data. Scope comes from GitHub issues and labels; ADRs record architecture decisions. `docs/REQUIREMENTS.md` is a historical reference for the retired prototype.

## Run locally

Use Node.js 22.12+ or 24+:

```sh
npm ci --prefix app
npm run dev --prefix app
```

The app is under active development. Do not use real financial data until production access and persistence have been verified.

Choose **Quick add expense** on the dashboard to record one or more expenses. The form starts with today's date and focuses the amount field. After a successful save, the dashboard refreshes and the form clears for the next expense.

Under **More → Dashboard widgets**, choose which cards appear on Home. All cards are visible by default, and changes are remembered in the current browser.

Under **More → Manage categories**, create a category or edit its name, color, and icon. Renaming a category updates its label on existing expenses and keeps those expenses linked to it.

Under **More → Import expenses**, choose a UTF-8 CSV or an Excel `.xlsx` workbook with a header row. Match date, amount, description, category, and optional notes. Use **Edit** to correct a row or choose its category, and **Remove** to leave out a row. You can restore removed rows before confirming. Use positive USD amounts and ISO dates (`YYYY-MM-DD`) or Excel cells formatted as dates. Column changes apply to rows you haven't edited. Any remaining invalid rows block confirmation. Retry an unconfirmed save from the same review to reuse the row IDs.

For Excel, use an unencrypted `.xlsx` workbook up to 5 MB. Review and confirm one worksheet at a time. Switching worksheets clears the current review. Excel formulas use their saved values. Replace formula errors or missing results with values in the worksheet or correct the affected rows in Ledger.

Ledger flags possible duplicates with the same date, amount, and description, ignoring letter case and extra whitespace. It compares each row with earlier rows in the review and expenses already saved for those dates. Choose **Keep** or **Skip** for each flagged row before importing.

Under **More → Receipt review**, open a JPEG, PNG, or WebP up to 8 MB and use **Start expense** to enter its details by hand. The image stays in the browser until you choose **Save private copy**. Saved images can be reopened or deleted from the same page, independently of expense records. The `private_receipt_storage` migration enables private copies on a Supabase environment. The manual flow makes no OCR or AI calls.

Under **More → Export data**, download all expenses or account balances as CSV or Excel. Accounts include the balance observation date, group, and archive status. Downloaded values use USD, and dates use ISO format (`YYYY-MM-DD`). CSV adds an apostrophe to formula-like text to prevent spreadsheet execution. Excel preserves that text in string cells.

Under **More → Reports**, compare USD spending by category and monthly totals over the last 12 months. The Balances view shows each account’s recorded monthly observations and net worth across accounts. Net worth carries each account’s last recorded balance forward, includes accounts from their first observation, and excludes them from their archive month onward. Archived account observations are still available in the account selector.

Choose **Download CSV** on a report card to save the values shown for the selected month or account. Downloads include the report name, period, and USD currency. A blank balance means no value was available for that month.

Expense validation moves focus to the field that needs attention. When an expense or account edit cannot be saved, the form keeps the values you entered. A save confirmation appears only after the write succeeds.

In Activity, select a month and use **Search descriptions** to find expenses by any part of their description. Matching ignores capitalization and surrounding spaces. Day totals reflect the visible expenses. **Clear search** removes the description query.

Open **Filters** to narrow the selected month by category, dates, or amounts. Date and amount bounds are inclusive and can be used on their own. Filters combine with description search. **Reset filters** clears the category, date, and amount filters while keeping the search text.

Under **More → Appearance**, choose System, Light, or Dark. System follows the device's color scheme. Ledger remembers your selection in the current browser and applies it to the sign-in screen as well.

## Supabase configuration

Copy `app/.env.example` to `app/.env.local` and set `LEDGER_SUPABASE_URL` and `LEDGER_SUPABASE_PUBLISHABLE_KEY`. Never commit environment files, service-role keys, database passwords, or provider tokens. The URL and publishable key are public browser configuration.

## Netlify

Netlify builds from `app/` with `npm run build` and publishes `dist/` using Node 22.12.0. Deploy Previews need test-project values for the two Supabase variables; Production needs values for the production project. Set them in the matching Netlify deploy contexts, not in Git.

Production builds from `main` remain skipped by `netlify.toml`. After access and persistence checks are complete, the owner can authorize one manual production deploy. Removing the old source does not publish anything; the existing production deployment remains until a manual deploy.

See the [deployment runbook](docs/DEPLOYMENT.md) for the hosted access preflight, deploy logs, and manual release procedure.

## Tests

CI builds the app with synthetic Supabase configuration and runs the owner sign-in/account browser suite:

```sh
npm ci --prefix app
npm run build --prefix app
python3 tests/test_owner_sign_in.py
```
