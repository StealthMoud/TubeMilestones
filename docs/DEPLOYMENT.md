# Deployment

Deployment has two independent parts: owner-configured Supabase/R2/Google services and a
static GitHub Pages presentation build. Publishing Pages does not configure the backend.

## GitHub repository settings

In Settings → Pages, choose **GitHub Actions** as the publishing source. Add exactly these
public repository Actions variables:

```text
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_PRIVACY_CONTACT_EMAIL=privacy@YOUR_OWNED_DOMAIN
```

Do not add Google secrets, YouTube refresh tokens, R2 keys, archive keys, automation
secrets, Supabase secret keys, or service-role credentials to repository variables. The
contact address is intentionally public once built. Do not set `VITE_ENABLE_DEMO` in
production.

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
8. Add the three public frontend variables and push `main`.

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
npm run audit:bundle
```

With Docker running, also apply and lint the local database:

```bash
npx supabase start
npm run db:lint
npm run db:test
npx supabase stop --no-backup
```

CI repeats these responsibilities, with a minimal database service for migrations.

## Post-deploy verification

- Pages workflow and CI are green for the exact commit.
- `/`, `/#/journey`, `/#/analytics`, `/#/settings`, `/privacy.html`, and `/terms.html`
  load at the project path without asset errors.
- The production bundle contains only the three public frontend configuration values.
- Email/password signup, confirmation, login, forgot-password, and recovery return to
  the approved Pages application callback without initiating YouTube OAuth.
- Google login returns to the Pages project path.
- YouTube start URL has `accounts.google.com` origin, `select_account consent`, no login
  hint, and exactly OpenID/email plus the two read-only YouTube scopes.
- Two different Google subjects can be added to one TubeMilestones account; channels
  switch across both, while reconnect and disconnect affect only the selected connection.
- OAuth callback, sync, 365D history, disconnect, and deletion produce sanitized logs.
- A second test user cannot read the first user's rows.
- R2 remains private and an archive round trip passes before hot rows are removed.
- The live site does not expose demo mode.

## Rollback

Pages can redeploy a previously known-good source commit without changing user data.
Database rollback must be additive and deliberate; do not reverse destructive migrations
against production. Edge Functions may be redeployed independently if their schema
contract remains compatible. Never delete R2 objects or hot rows as a rollback shortcut.

## Future custom-domain cutover

Relative production assets and HashRouter routes let the same build run at the current
GitHub project path or a future root custom domain. No security-sensitive code assumes
the GitHub origin. Perform this owner-controlled cutover as one coordinated change:

1. Buy or choose an owned production domain.
2. Configure that domain in GitHub Pages and make the required DNS changes there.
3. Wait for GitHub Pages HTTPS to become active, then verify the real certificate and
   redirects.
4. Set the Edge secret `FRONTEND_URL` to the canonical HTTPS application URL.
5. Set `TUBEMILESTONES_ALLOWED_ORIGINS` to the explicit HTTPS origin list, retaining the
   old origin only for the intended transition window.
6. Update Supabase Auth Site URL and its exact redirect allow-list.
7. Update the Google OAuth application's homepage.
8. Update the public privacy-policy URL.
9. Update the public terms URL.
10. Verify the owned domain in Google Search Console.
11. Update the OAuth consent screen's authorized domains.
12. Run the complete sign-in, Connect YouTube, reconnect, callback, sync, disconnect,
    and account-deletion regression suite against the new origin.

Do not change `GOOGLE_YOUTUBE_REDIRECT_URI` merely because the frontend domain changes:
Client B still returns to the Supabase Edge callback unless that backend endpoint itself
is deliberately replaced. GitHub Pages cannot set arbitrary response security headers;
use a controlled CDN in front if strict headers are required, then verify actual live
responses.
