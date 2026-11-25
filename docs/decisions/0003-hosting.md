# 0003: Hosting

- **Status:** Accepted
- **Date:** 2026-11-24
- **Decided by:** Repo owner, after review in issue #70
- **Related:** #70 (evaluation), #9 (pipeline), ADR 0001 (database, auth, storage), ADR 0002 (frontend)

## Decision
Host the static frontend on **Netlify (Free plan)**. Keep **Cloudflare Pages** as the fallback.

While the app is under active development, production deploys are manual: `netlify.toml` skips builds from `main` (PR #74). Pull-request previews still build and cost 0 credits. Deploy on purpose with a build hook or the Netlify CLI; delete the `ignore` line to resume automatic deploys.

## Why
- Already connected, with free pull-request previews.
- The Free plan allows about 20 production deploys a month (300 credits at 15 per deploy), plenty when deploys are deliberate.
- Data lives in Supabase, so a Netlify pause makes the site unavailable but does not affect the data.
- The build output is plain static files plus a single-page-app fallback, so moving hosts is a small change.

## Known limits (official docs, checked 2026-11-24)
- When the monthly credits run out, all projects on the team pause ("Site not available") until the next billing cycle or an upgrade. Credits cannot be bought on Free.
- Other metered items: bandwidth (20 credits/GB), requests (2 credits per 10,000), function compute (10 credits per GB-hour).

## Alternatives considered
- **Cloudflare Pages:** 500 builds a month and free static assets; bandwidth and at-limit behavior were not verified. Fallback.
- **Vercel Hobby:** workable limits; personal-use terms not verified.
- **AWS Amplify:** free for 12 months only, then pay-as-you-go with no hard cap. Rejected.

## Triggers to revisit
- Credits become a real constraint, or the site is paused.
- Server-side functions need meaningful compute on Netlify.

## Not decided here
Where server-side functions run (Supabase Edge Functions or Netlify Functions). Decide when #32 (receipt and image extraction) starts; the same answer applies to #33.
