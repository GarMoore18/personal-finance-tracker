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
  command: "cd {worktree} && npm ci --prefix app && npm run verify --prefix app"
  timeout_minutes: 20
triage:
  max_per_run: 3
protected_paths: [".github/", ".baton/", ".claude/", "netlify.toml", "docs/decisions/"]
---
# Ledger Baton brief

Batch up to three independent, small-to-medium issues in a sprint. Keep one issue per branch, PR, and worktree; sequence dependencies and work one developer at a time to control cost. If an issue is blocked, leave one concise issue comment and pause that issue without retrying; continue only with other independent sprint issues. Keep the existing project rules in `AGENTS.md` authoritative.
The reviewer must verify the exact pull-request head and passing CI before `baton merge-pr`.
Never merge when CI is missing, pending, or failing.
