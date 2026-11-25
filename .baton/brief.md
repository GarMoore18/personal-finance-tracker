---
triager:
  model: haiku
  effort: low
refiner:
  model: haiku
  effort: low
researcher:
  model: haiku
  effort: low
developer:
  model: haiku
  effort: low
  max_parallel: 1
reviewer:
  model: haiku
  effort: low
review:
  required: true
  max_rounds: 2
merge:
  allow_no_ci: false
verify:
  command: python3 tests/test_ledger.py
  timeout_minutes: 20
triage:
  max_per_run: 1
protected_paths:
  - .github/
  - .baton/
  - netlify.toml
  - docs/decisions/
---
# Ledger Baton brief

Use one issue per sprint. Keep the existing project rules in `AGENTS.md` authoritative.
The reviewer must verify the exact pull-request head and passing CI before `baton merge-pr`.
Never merge when CI is missing, pending, or failing.
