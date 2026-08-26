# Supabase setup

The repository contains migrations and Edge Functions, but no production Supabase
project credentials. The owner must perform this setup against the intended project.

## Project checklist

1. Create a Supabase project in a region appropriate for the users and data policy.
2. Record the project URL.
3. Copy the current browser **publishable key** (`sb_publishable_…`), not a secret key.
4. In Authentication → Providers, configure Google using OAuth Client A from
   [Google OAuth setup](GOOGLE_OAUTH_SETUP.md).
5. Set Authentication → URL Configuration:
   - Site URL: `https://stealthmoud.github.io/TubeMilestones/`
   - Additional redirect URL: `https://stealthmoud.github.io/TubeMilestones/**`
   - Add `http://127.0.0.1:5173/**` only for local development.
6. Link the CLI to the intended project and apply both migrations:

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

10. Add the Google Client B secrets:

    ```text
    FRONTEND_URL=https://stealthmoud.github.io/TubeMilestones/
    GOOGLE_YOUTUBE_CLIENT_ID=...
    GOOGLE_YOUTUBE_CLIENT_SECRET=...
    GOOGLE_YOUTUBE_REDIRECT_URI=https://PROJECT_REF.supabase.co/functions/v1/youtube-oauth-callback
    ```

11. Add the four R2 secrets from [R2 setup](R2_SETUP.md).
12. Generate and add `ARCHIVE_MASTER_KEY_V1` as described below.
13. Create the Cron Vault values in SQL Editor, substituting real values without
    committing them:

    ```sql
    select vault.create_secret(
      'https://PROJECT_REF.supabase.co',
      'tubemilestones_project_url'
    );
    select vault.create_secret(
      'SUPABASE_SERVER_SECRET_KEY',
      'tubemilestones_automation_secret'
    );
    ```

    The automation value must be the same elevated server key accepted by the hosted
    functions. It never belongs in the frontend.

14. Install the compliance and deletion-retry jobs:

    ```sql
    select public.install_tubemilestones_cron_jobs();
    ```

    Verify one daily job at 02:15 UTC and one at 03:15 UTC. Do not add a full YouTube
    synchronization Cron job.

15. Trigger each job in a safe test project and inspect typed counts plus sanitized logs.
16. Verify RLS with two test users: own rows must be accessible where documented; the
    other user's rows and every server-only table must be inaccessible.

## Hosted runtime keys

Supabase provides hosted functions with project URL and server credentials. The code
accepts the current `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` names and the
legacy injected `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` names. Never expose a
secret/service-role key to Vite or GitHub Pages.

## Archive master key

Generate a 32-byte value on a trusted owner workstation:

```bash
openssl rand -base64 32
```

Do not run generation in CI, commit the output, paste it into an issue, or display it in
the app. Store it as the Supabase Edge secret `ARCHIVE_MASTER_KEY_V1`. The repository
does not contain a generated key.

For rotation, add `ARCHIVE_MASTER_KEY_V2` before writing manifests with key version 2;
retain V1 until every V1 object has been migrated and verified.

## Database types and local validation

After applying migrations, regenerate `supabase/database.types.ts` using the official
command in its file header and review exact bigint/string shapes. For local migration
linting, start Docker and run:

```bash
npx supabase start
npm run db:lint
npx supabase stop --no-backup
```

The CI database job starts a minimal local Supabase database, applies migrations, and
fails on SQL lint errors.
