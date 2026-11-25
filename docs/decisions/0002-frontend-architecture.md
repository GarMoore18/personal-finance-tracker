# 0002: Frontend and application architecture

- **Status:** Accepted
- **Date:** 2026-11-24
- **Decided by:** Repo owner, after review in issue #3
- **Related:** #3 (architecture), #70 (hosting, still open), #10 (app shell), ADR 0001 (database, auth, storage)

## Decision
- **Frontend:** a static, mobile-first, installable web app (PWA) built with **Vite, TypeScript, and React**.
- **Data, login, private storage:** Supabase, called directly from the browser with the public key. Row-level security enforces access (ADR 0001). No custom server for core features.
- **Server-side work** (receipt and PDF extraction, anything using secret keys): deferred to the Phase 3 imports (#32, #33). Where it runs (Supabase Edge Functions or the host's functions) is decided together with hosting in #70.
- **Hosting:** static hosting, decided in #70. The build output must stay portable: plain static files plus a single-page-app fallback, so the host can change without code changes.
- **Repo layout and the fate of the prototype** are decided in #10 (app shell).

## Why
- The prototype is one large HTML file. About 40 planned issues will not fit well into it. Components and types keep each change small and testable.
- React has the largest ecosystem for forms, charts, and tests, and the owner agreed to it.
- Browser-to-Supabase with RLS avoids running and securing a custom server for a single-user app.

## Reusable from the prototype
Colors and design tokens, default categories, the light/dark approach, PWA manifest and icons, the monthly-snapshot idea, CSV/Excel export logic, input-validation ideas, and the test scenarios.

## Not carried over
localStorage as the source of truth, Google Sheets sync, the single-file structure, and the per-transaction account, pending, transfer, and reconcile model (deferred in the requirements).

## Consequences
- A build step and dependencies are introduced. The "no new dependencies" rule in `AGENTS.md` applies to the prototype only.
- `netlify.toml` (publish directory, build command) changes when the new app is deployed (#9).
- Other frameworks (for example Svelte or Vue) were not evaluated in depth; vanilla ES modules were considered and rejected as too much hand-built code.
