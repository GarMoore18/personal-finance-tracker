# 0004: Core financial data model

- **Status:** Accepted
- **Date:** 2026-11-24
- **Related:** #71 (model), #5 (migrations), #11–#16 (accounts and expenses), #27 (integrity tests), [ADR 0001](0001-database-auth-storage.md)

## Entities

Every financial row belongs to one authenticated owner. Use stable IDs and enforce matching ownership on every reference as well as row-level security. The product supports one owner and USD at launch.

| Entity | Relationship and rules |
|---|---|
| Account group | Optional organizational parent for accounts. Its totals are derived from member accounts. |
| Account | Asset or liability with an optional group and a manually maintained current balance. A positive liability is debt owed. Preserve historical accounts and their snapshots when archiving. |
| Balance snapshot | One recorded balance per account and calendar month, keyed by the first day of that month and accompanied by a capture date. Same-month changes replace that month's value. Later months never overwrite earlier rows. Missing history remains missing. |
| Category | Owner-scoped flat expense label. Expenses keep their original category when it is renamed. Reassign expenses before deleting a referenced category. |
| Transaction | A manual expense with a positive amount, purchase date, required description and category, and optional notes. Adding, editing, or deleting an expense leaves account balances and snapshots independent. |
| Transfer | Deferred. When introduced, link the source and destination under one logical transfer and exclude it from spending and income totals. Moving money between tracked accounts leaves combined net worth unchanged. |

## Money, dates, and aggregates

- Store USD as exact PostgreSQL decimal values with a maximum of two fractional digits and twelve whole digits. Validate before coercion so extra precision is rejected. Parse user-entered decimal strings into integer cents for client computations and sum cents exactly.
- Store expense dates, balance observation dates, and month keys as calendar dates. Use the owner's local calendar when defaulting to today or selecting reporting months. Persist a user-selected date as entered. Store audit timestamps as timezone-aware instants.
- Compute current net worth as the sum of asset balances minus the sum of liability balances, counting each active account once. Negative asset balances reduce net worth; negative liabilities represent credits and increase it. Historical reporting uses recorded account snapshots and explicitly labels missing observations.
- Update an account's current balance and that month's snapshot in one database transaction when recording a new balance. Reject observations older than the current observation from this workflow so a retry or late update cannot replace a newer current balance.

## Examples

| Example | Result |
|---|---|
| Record a $42.50 grocery expense dated November 24 | November grocery spending increases by $42.50, and current account balances stay the same. |
| Checking $1,200, savings $800, credit card $300 owed | Net worth is $1,700. A Banking subtotal of $2,000 is a display value. |
| Record Checking at $1,200 on November 24 and $1,100 on November 27 | November shows $1,100, captured November 27. Recording $1,250 in December adds a December point. An account first recorded in December has no November point. |
| Future transfer of $100 from checking to savings | Checking falls by $100 and savings rises by $100. Spending, income, and total net worth are unchanged. |

Account-linked expenses and transfers are deferred. Keep IDs and ownership explicit so they can be added later without a redesign.
