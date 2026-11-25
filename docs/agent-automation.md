# Issue automation

## Decision

Use [Baton](https://github.com/barretstorck/baton), the Claude Code plugin. It keeps one issue's plan and progress on GitHub, gives each planned task a fresh developer context in the issue worktree, and checks reviewer approval plus CI before merging. This adds a cheap Haiku reviewer at low effort, bounded to two rounds. Codeband uses a larger multi-agent topology; Agent Orchestrator is a dashboard/runtime for manually spawned sessions; chipping-orchestrator and Bernstein leave merge decisions to a human. The smaller single-agent Baton lacks a CI-gated merge and has unbounded retry behavior. Baton needs Claude Code, `gh`, and Python 3.11+, with local credentials kept outside the repo.

## Comparison

Token ratings are qualitative: most projects do not publish a per-issue benchmark.

| Project | Token overhead | Autonomy and CI gate | Setup |
| --- | --- | --- | --- |
| [Codeband](https://github.com/band-ai/codeband) | High: planner, plan reviewer, coders, code reviewers, and merge roles by default. | Headless issue/PR workflow; risk-aware auto-merge. | Python, Band account, Claude and Codex auth, multi-role config. |
| [Agent Orchestrator](https://github.com/OrchestratorInc/agent-orchestrator) | Medium to high: one agent per worktree; no published per-task token baseline. | Routes CI failures/review comments; auto-merge is configurable. | Node 20, `gh`, runtime/dashboard setup; issue sessions are spawned from its CLI. |
| [chipping-orchestrator](https://github.com/chippingway/chipping-orchestrator) | Medium: decomposition, developer, and independent reviewer; per-issue usage logs. | Issue to reviewed PR with local verification; current docs require a human to merge. | Python package, local CLI auth, repo config and poller. |
| [Bernstein](https://docs.bernstein.run/en/stable/orchestration/issue-to-pr/) | Medium to high: separate plan, implementation, and revision stages. | Draft PR and revision loop; plan approval and merge remain operator-gated. | GitHub App plus custom stage wiring and a runner. |
| [Baton (mraza007)](https://github.com/mraza007/baton) | Low: one Claude worker per issue; no published token measurement. | Polls issues and opens PRs, but has no built-in CI merge gate and retries failed work. | Python package, `gh`, Claude CLI, one `WORKFLOW.md`. |
| **[Baton (barretstorck)](https://github.com/barretstorck/baton)** | Medium: fresh developer context per task plus a Haiku reviewer; per-issue usage is reported. | One-issue sprint, bounded review loop, and merge only after review approval and CI. | Claude Code plugin, `gh`, Python 3.11+, labels/hooks, and a local scheduler. |

## Setup

1. Install Claude Code, Git, `gh`, Python 3.11 or later, and the repo's documented test prerequisites: `pip install playwright && playwright install chromium`. Authenticate `gh` locally; keep all credentials and private settings outside this repository.
2. Install Baton using its [official setup instructions](https://github.com/barretstorck/baton#install). Keep the committed `.baton/brief.md`; it sets Haiku/low effort roles, one developer at a time, two review rounds, and `allow_no_ci: false`.
3. Run one issue per sprint. The scheduled Baton command resumes an already planned sprint; it does not create one. Keep each sprint to one issue and stop on `status:blocked`.
4. The `Ledger browser tests` check runs `python3 tests/test_ledger.py`. `main` is protected outside the repository: changes require a PR and this strict status check; admins are covered, force-pushes and deletion are disabled, and no bypass is configured. There is no human approval requirement; Baton still requires its reviewer approval. Keep the branch rule enabled and update its required check if the job name changes.
5. Follow Baton’s [scheduled-run guide](https://github.com/barretstorck/baton/blob/main/docs/scheduling.md) on a trusted local host. Do not put local settings, keys, personal finance data, or credentials in the repo.

At completion, run `baton usage` and report the per-issue estimate. Baton documents output-token counts as lower bounds.
