-- Separate Supabase gateway routing from TubeMilestones automation authorization.

-- The public/publishable key is used only for Supabase gateway routing. The
-- independent automation secret is the credential checked by function code.
-- Vault values required before installation:
--   tubemilestones_project_url
--   tubemilestones_publishable_key
--   tubemilestones_automation_secret
create or replace function public.install_tubemilestones_cron_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project_url text;
  v_publishable_key text;
  v_automation_secret text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'tubemilestones_project_url';
  select decrypted_secret into v_publishable_key
  from vault.decrypted_secrets where name = 'tubemilestones_publishable_key';
  select decrypted_secret into v_automation_secret
  from vault.decrypted_secrets where name = 'tubemilestones_automation_secret';

  if v_project_url is null
     or v_publishable_key is null
     or v_automation_secret is null
     or char_length(v_automation_secret) < 32 then
    raise exception 'required TubeMilestones Cron Vault configuration is missing or invalid';
  end if;

  perform cron.unschedule('tubemilestones-compliance-revalidate')
  where exists (
    select 1 from cron.job where jobname = 'tubemilestones-compliance-revalidate'
  );
  perform cron.unschedule('tubemilestones-deletion-worker')
  where exists (
    select 1 from cron.job where jobname = 'tubemilestones-deletion-worker'
  );

  perform cron.schedule(
    'tubemilestones-compliance-revalidate',
    '15 2 * * *',
    $job$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'tubemilestones_project_url'
        ) || '/functions/v1/compliance-revalidate',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'tubemilestones_publishable_key'
          ),
          'X-TubeMilestones-Automation', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'tubemilestones_automation_secret'
          )
        ),
        body := '{}'::jsonb
      );
    $job$
  );

  perform cron.schedule(
    'tubemilestones-deletion-worker',
    '15 3 * * *',
    $job$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'tubemilestones_project_url'
        ) || '/functions/v1/deletion-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'tubemilestones_publishable_key'
          ),
          'X-TubeMilestones-Automation', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'tubemilestones_automation_secret'
          )
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$function$;

revoke execute on function public.install_tubemilestones_cron_jobs()
  from public, anon, authenticated;
grant execute on function public.install_tubemilestones_cron_jobs() to service_role;
