---
name: ledger-financial-data
description: Apply Ledger's finance and persistence rules when changing money, transactions, accounts, balance history, migrations, imports, exports, or totals.
---

1. Read the issue and the relevant rule in the data model or ADR 0001. For prototype changes, check AGENTS.md and the existing Ledger tests.
2. Trace money from input through storage and aggregation to display or export. Check exact decimal handling, calendar dates, and whether each row contributes to the total once.
3. Check account classification, explicit balance updates, monthly history, and behavior when an account or category disappears. Prototype transfers and pending-to-cleared transactions must preserve their existing semantics.
4. For database changes, verify owner-scoped reads and writes, including foreign-key ownership, with two synthetic users. Keep credentials and actual financial records out of test fixtures.
5. Run the smallest relevant regression check first. Report the invariant verified and the result.
