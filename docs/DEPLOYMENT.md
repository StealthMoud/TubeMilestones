# Deployment

Deployment has two independent parts: owner-configured Supabase/R2/Google services and a
static GitHub Pages presentation build. Publishing Pages does not configure the backend.

## GitHub repository settings

In Settings → Pages, choose **GitHub Actions** as the publishing source. Add exactly these
repository Actions variables:

```text
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Do not add Google secrets, YouTube refresh tokens, R2 keys, archive keys, Supabase secret
keys, or service-role credentials to repository variables. Do not set
`VITE_ENABLE_DEMO` in production.

The workflow builds only `dist`, uses project-path-safe relative assets and HashRouter,
and deploys through the protected `github-pages` environment. Expected URL:

```text
https://stealthmoud.github.io/TubeMilestones/
```

## Backend release order

1. Complete [Google OAuth setup](GOOGLE_OAUTH_SETUP.md).
2. Create/configure the Supabase project with [Supabase setup](SUPABASE_SETUP.md).
3. Create the private bucket and secrets with [R2 setup](R2_SETUP.md).
4. Apply migrations and inspect RLS/grants.
5. Deploy Edge Functions and set secrets.
6. Install only compliance and deletion Cron jobs.
7. Test OAuth, initial sync, archive round trip, disconnect, and account deletion in a
   non-production account.
8. Add the two frontend variables and push `main`.

## Pre-push gate

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run backend:lint
npm run backend:check
npm run test:e2e
npm run build
```

With Docker running, also apply and lint the local database:

```bash
npx supabase start
npm run db:lint
npx supabase stop --no-backup
```

CI repeats these responsibilities, with a minimal database service for migrations.

## Post-deploy verification

- Pages workflow and CI are green for the exact commit.
- `/`, `/#/journey`, `/#/analytics`, `/#/settings`, `/privacy.html`, and `/terms.html`
  load at the project path without asset errors.
- The production bundle contains only the two public frontend configuration values.
- Google login returns to the Pages project path.
- YouTube start URL has `accounts.google.com` origin and the exact two read-only scopes.
- OAuth callback, sync, 365D history, disconnect, and deletion produce sanitized logs.
- A second test user cannot read the first user's rows.
- R2 remains private and an archive round trip passes before hot rows are removed.
- The live site does not expose demo mode.

## Rollback

Pages can redeploy a previously known-good source commit without changing user data.
Database rollback must be additive and deliberate; do not reverse destructive migrations
against production. Edge Functions may be redeployed independently if their schema
contract remains compatible. Never delete R2 objects or hot rows as a rollback shortcut.

## Custom domain and headers

A future custom domain must be added consistently to Supabase Auth redirects, the Google
consent screen, Client B callback policy where applicable, `FRONTEND_URL`, and legal
links. GitHub Pages cannot set arbitrary response security headers; use a controlled CDN
in front if strict headers are required, then verify actual responses.
