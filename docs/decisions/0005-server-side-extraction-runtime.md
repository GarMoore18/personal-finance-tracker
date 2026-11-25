# 0005: Server-side extraction runtime

- **Status:** Accepted
- **Date:** 2026-11-25
- **Decided by:** Repo owner delegated runtime design in #32
- **Related:** #32 (image and receipt extraction), #33 (PDF extraction), [ADR 0001](0001-database-auth-storage.md), [ADR 0002](0002-frontend-architecture.md), [ADR 0003](0003-hosting.md)

## Decision

Run server-side receipt, image, and PDF extraction through **Supabase Edge Functions**. Keep the static frontend on Netlify.

Store uploaded files in private Supabase Storage and pass an authorized object path to the function. Keep the selected AI/OCR provider key in Supabase Function secrets. Provider selection and cost/privacy review belong in the implementation plan for #32.

Require a signed-in user's JWT (verify_jwt stays enabled). Check that the object belongs to the caller and use user-scoped access with RLS for user data. Do not use an admin key for routine user operations. Return extracted fields as an editable candidate with uncertainty indicators; never create a transaction automatically.

Do not run CPU-heavy OCR or image processing in the Edge Function. It should make a bounded call to the external extraction provider and validate the returned fields. The hosted Edge runtime currently allows 256 MB memory, 2 seconds of CPU per request, and 150 seconds wall time on Free (400 seconds on paid plans). These constraints favor external processing over bundled OCR.

## Why

- The browser app already uses Supabase Auth, and files belong in private Supabase Storage.
- Keeping provider credentials and extraction calls in Supabase avoids another server runtime and Netlify Function compute credits.
- The user's JWT and RLS can scope file and transaction access consistently.
- Returning a candidate keeps the user in control of financial data.

## Alternatives considered

- **Netlify Functions:** close to the static app, but introduces separate Supabase JWT validation and uses Netlify's shared metered compute credits.
- **Local/browser OCR:** avoids a provider call but exposes processing and quality limits on mobile devices; it does not meet the server-side secret requirement.
- **OCR inside Supabase Edge Functions:** rejected because the hosted CPU and memory limits are not suited to heavy local image/PDF processing.

## Prerequisites and scope

- Complete #6 (secure application access) before using real receipts or production storage.
- Complete #16 (manual expense creation) before connecting user-confirmed candidates to transaction saving. Candidate extraction can be built with synthetic data before that integration.
- #10 (application shell) is complete. CSV review in #30 can inform the confirmation UX but is not a dependency.
- Apply this runtime decision to #33. Scanned-PDF processing and any long-running jobs need a separate review against the same runtime limits.

## Sources checked 2026-11-25

- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase Edge Function authorization headers and JWT verification](https://supabase.com/docs/guides/functions/auth-headers)
- [Netlify Functions usage and billing](https://docs.netlify.com/build/functions/usage-and-billing/)
