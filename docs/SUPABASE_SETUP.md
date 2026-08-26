# Supabase setup

The repository contains forward migrations and Edge Functions, but no production
Supabase credentials. The owner must perform this setup against the intended isolated
project.

## Project checklist

1. Create a Supabase project in a region appropriate for the users and data policy.
2. Record the project URL.
3. Copy the current browser **publishable key** (`sb_publishable_…`), not a secret key.
4. In Authentication → Providers, configure Google using OAuth Client A from
   [Google OAuth setup](GOOGLE_OAUTH_SETUP.md).
5. Set Authentication → URL Configuration:
   - Site URL: the canonical production `FRONTEND_URL`.
   - Additional redirect URL: the exact production path pattern, such as
     `https://stealthmoud.github.io/TubeMilestones/**` during GitHub project hosting.
   - Add `http://127.0.0.1:5173/**` only for local development.
6. Link the CLI to the intended project and apply every forward migration:

   ```bash
   npx supabase login
   npx supabase link --project-ref PROJECT_REF
   npx supabase db push
   ```

7. Confirm the `vault`, `pg_cron`, and `pg_net` extensions are available after migration.
8. Inspect every table under Database → Policies and verify RLS is enabled.
9. Deploy all Edge Functions:

   ```bash
   npx supabase functions deploy youtube-oauth-start
   npx supabase functions deploy youtube-oauth-callback --no-verify-jwt
   npx supabase functions deploy youtube-sync
   npx supabase functions deploy history-query
   npx supabase functions deploy disconnect-youtube
   npx supabase functions deploy delete-account
   npx supabase functions deploy compliance-revalidate --no-verify-jwt
   npx supabase functions deploy deletion-worker --no-verify-jwt
   ```

10. Configure all required server secrets. These names belong only in the trusted Edge
    runtime:

    ```text
    FRONTEND_URL=https://stealthmoud.github.io/TubeMilestones/
    TUBEMILESTONES_ALLOWED_ORIGINS=https://stealthmoud.github.io
    TUBEMILESTONES_AUTOMATION_SECRET=<independent high-entropy value>

    GOOGLE_YOUTUBE_CLIENT_ID=...
    GOOGLE_YOUTUBE_CLIENT_SECRET=...
    GOOGLE_YOUTUBE_REDIRECT_URI=https://PROJECT_REF.supabase.co/functions/v1/youtube-oauth-callback

    R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
    R2_BUCKET=tubemilestones-history
    R2_ACCESS_KEY_ID=...
    R2_SECRET_ACCESS_KEY=...

    ARCHIVE_ACTIVE_KEY_VERSION=1
    ARCHIVE_MASTER_KEY_V1=<independent 32-byte key>
    ```

    `FRONTEND_URL` is the one fixed post-OAuth destination. The origins value is a
    comma-separated explicit allow-list with no wildcard; it must include the canonical
    `FRONTEND_URL` origin. Use localhost entries only when the canonical frontend is
    itself local.

11. Generate the automation secret on a trusted owner workstation, independently from
    every Supabase platform credential:

    ```bash
    openssl rand -base64 32
    ```

    Set it as `TUBEMILESTONES_AUTOMATION_SECRET`. Never use `SUPABASE_SECRET_KEY` or
    `SUPABASE_SERVICE_ROLE_KEY` as this value, and never commit or print the generated
    secret.

12. Complete the private R2 bucket and archive-key setup in [R2 setup](R2_SETUP.md).
13. Create the Cron Vault values in SQL Editor, substituting the public publishable key
    and the same dedicated automation secret without committing them:

    ```sql
    select vault.create_secret(
      'https://PROJECT_REF.supabase.co',
      'tubemilestones_project_url'
    );
    select vault.create_secret(
      'sb_publishable_...',
      'tubemilestones_publishable_key'
    );
    select vault.create_secret(
      'THE_INDEPENDENT_TUBEMILESTONES_AUTOMATION_SECRET',
      'tubemilestones_automation_secret'
    );
    ```

    The publishable key is used only by the Supabase gateway for request routing. The
    `X-TubeMilestones-Automation` header is the independent application authorization
    checked inside both workers. Neither value is a Supabase secret/service-role key.

14. Install the compliance and deletion-retry jobs:

    ```sql
    select public.install_tubemilestones_cron_jobs();
    ```

    Verify one daily job at 02:15 UTC and one at 03:15 UTC. The stored commands resolve
    Vault values at execution time; they do not embed the secret in `cron.job.command`.
    Do not add a full YouTube synchronization Cron job.

15. Trigger each job in a safe test project and inspect typed counts plus sanitized logs.
16. Verify RLS with two test users: own rows must be accessible where documented; the
    other user's rows and every server-only table/RPC must be inaccessible.

## Hosted runtime keys

Supabase provides hosted functions with project URL and server credentials. The code
accepts the current `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` names and the
legacy injected `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` names. Never expose a
secret/service-role key to Vite or GitHub Pages, and never reuse it for TubeMilestones
automation authentication.

## Archive master key

Generate a separate 32-byte value on a trusted owner workstation:

```bash
openssl rand -base64 32
```

Do not run generation in CI, commit the output, paste it into an issue, or display it in
the app. Store it as `ARCHIVE_MASTER_KEY_V1` and set
`ARCHIVE_ACTIVE_KEY_VERSION=1`. The repository contains no generated key. Future
versions use `ARCHIVE_MASTER_KEY_V2`, and so on; follow the verified rotation procedure
in [R2 setup](R2_SETUP.md).

## Database types and local validation

After applying migrations, regenerate `supabase/database.types.ts` using the official
command in its file header and review exact bigint/string shapes. With Docker running,
validate a clean database from zero:

```bash
npx supabase start
npm run db:lint
npm run db:test
npx supabase stop --no-backup
```

CI starts a minimal local Supabase database, applies all migrations, fails on SQL lint
errors, and runs pgTAP privilege/concurrency tests for both server-only claim RPCs.
