# Requirements and design decisions

Captured from the product interview (Nov 2026).

## Users and goals
- Primary user: one person (owner). A second person is a **backlog** item.
- Main goal: see where money goes. Optional per-category limits come second.
- Device: iPhone first (installed from Safari as a Home Screen app); laptop secondary.

## Data in
- Fast manual entry (amount-first keypad), CSV import with review queue, recurring bills.
- Bank auto-sync: **not planned** (backlog only; design stays open to it).

## Data home
- Google Sheet via Apps Script (user owns the data). Local-first: the app works offline.

## Pain points addressed
| Problem | Design response |
|---|---|
| Pending charge double counted when it posts | One record per purchase. "Clear" edits the same record (amount can change). |
| Starting balances never lined up | Per-account "balance as of" date; older transactions are not counted again. |
| Investment values move without transactions | Investment accounts are tracked by value updates, never counted as spending. |
| Wanted a "today's snapshot" at month start | Automatic monthly snapshot; "change since snapshot" on Accounts. |
| Balance drift vs bank | Reconcile: enter bank balance, see the difference, optionally add an adjustment. |

## Layout (industry-informed)
- Bottom tab bar: Home, Activity, + (center), Accounts, More (Copilot/YNAB/Monarch pattern).
- Home: spent vs last month's pace, top categories, pending, accounts; cards can be hidden/reordered.
- Add: amount-first keypad, one-tap chips for category, account, date, pending.

## Phases
1. Mobile rebuild (this phase): PWA, tabs, keypad add, Home cards, pending flow, snapshots, reconcile.
2. Data in: CSV import with review queue and pending matching; recurring bills + "Upcoming".
3. Limits and polish: optional category limits UI, richer customizable Home.

## Backlog
- Second person: shared household / owner tags / separate + combined views.
- Bank auto-sync (not planned).
- Real merge-based sync (current sync is last-write-wins).
