# Netlify deployment

Deploy Previews build pull requests automatically. Netlify builds from `app/` using Node 22.12.0 and publishes `app/dist`. The Production context uses the hosted Supabase project. The Deploy Preview context uses a separate test project with synthetic data. Set `LEDGER_SUPABASE_URL` and `LEDGER_SUPABASE_PUBLISHABLE_KEY` in the matching context. Browser builds take these public values at build time.

Review the preview from the pull request's Netlify check. If the preview returns HTTP 401, use authorized site access and confirm the Ledger sign-in screen loads. Test sign-in and expense persistence there with synthetic data, including a second browser session. If a build fails, open its Deploy log and check the build context, project URL, publishable key, and Node version. A ready Deploy Preview status confirms Netlify published the assets.

## Before a production deploy

Follow the [release review](RELEASE-REVIEW.md) and [backup runbook](BACKUP-RECOVERY.md). Use the Production project's URL and publishable key in a local shell and run:

```sh
python3 scripts/check_hosted_access.py
```

The check reads Auth settings and requests zero rows from each financial resource anonymously. It exits with an error if it cannot verify disabled public registration and anonymous sign-in, or if a financial resource does not explicitly deny the anonymous request. The check covers the hosted project without needing owner credentials. Verify the owner session separately.

Production stays in manual-deploy mode. After the owner authorizes the release, use a clean checkout of the reviewed `main` commit, verify the target site in Netlify, and build with Production's public Supabase configuration. Supply an authorized Netlify CLI session and the verified site ID from the project settings.

```sh
npm ci --prefix app
npm run build --prefix app
netlify deploy --site "$LEDGER_NETLIFY_SITE_ID" --dir app/dist --no-build --prod
```

Check that the resulting deploy is published on the intended site. Use the owner account and a synthetic expense to verify production sign-in and persistence across separate sessions. Keep real financial data out until those checks and the backup schedule pass.

If the deploy is published but the smoke test fails, use Netlify's Deploys page to republish the last known working deploy. Check the failed deploy's log and context before rebuilding. Republishing restores static assets and leaves Supabase data and migrations in place.

[Netlify deploy CLI reference](https://cli.netlify.com/commands/deploy/)
