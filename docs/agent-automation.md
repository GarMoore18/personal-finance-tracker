# Agent workflow

Codex is the repo's agent. Start from the GitHub issue and its direct dependencies. Keep each change on its own branch and PR, and record progress and blockers in the ignored `.agent-session.md` between sessions. Use the least costly capable model and run deterministic checks from scripts.

Run `npm ci --prefix app` and `npm run verify --prefix app` with a supported Node version and Chromium installed. The required `Ledger browser tests` workflow runs the same build and browser suite using synthetic data. Keep strict branch protection and wait for required checks before merging. Production deploys stay manual.

To inspect progress, request only the GitHub fields you need:

```sh
gh pr list --state open --json number,title,isDraft,mergeStateStatus
```
