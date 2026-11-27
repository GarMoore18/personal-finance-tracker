# Ledger agent guide

Ledger is a phone-first personal finance app. The active React, TypeScript, and Vite PWA is in `app/`; Supabase auth and browser data access follow ADRs 0001–0003. GitHub issues and labels define scope. `docs/REQUIREMENTS.md` is historical prototype reference, not the active backlog.

## Direction and safety
- Netlify builds `app/` and publishes `dist/`. Production deploys stay manual; preserve the `ignore` rule and do not trigger production deploys unless the owner asks.
- ADR 0005 selects Supabase Edge Functions for extraction. #32 tracks provider selection. Keep paid extraction out of the default path. Follow ADR 0001 before real financial data is used.
- Never commit secrets, environment files, real financial data, service-role keys, or database passwords. Only the owner directs changes to `.github/`.

## Workflow

Codex handles issues in owner sessions and uses GitHub Actions for deterministic verification.
1. Read the issue and direct dependencies only. For design ambiguity, comment with a short plan and options.
2. Keep one issue per branch/PR/worktree. A session may handle up to three independent issues. Reference the issue in the PR.
3. For app changes run `npm ci --prefix app` and `npm run verify --prefix app` with the documented Node and Chromium prerequisites. Add focused coverage for behavior changes; update related docs.
4. Merge only after required CI passes and main protection remains enabled.

## Efficiency
- Use the cheapest capable model; keep routine work small and delegate only independent tasks or low-cost reviews.
- Read narrow file ranges, avoid rescanning the repo or dumping large logs, and keep PR descriptions concise.
- Maintain ignored `.agent-session.md` as a compact handoff with status, blockers, next steps, and rough usage estimate.
