-- Trusted helpers are callable only with a server secret/service role.

create or replace function public.store_youtube_refresh_token(
  p_user_id uuid,
  p_refresh_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if p_refresh_token is null or char_length(p_refresh_token) < 20 then
    raise exception 'invalid refresh credential';
  end if;

  select secret_id into v_secret_id
  from public.youtube_token_vault
  where user_id = p_user_id
  for update;

  if v_secret_id is null then
    select vault.create_secret(
      p_refresh_token,
      'tm-youtube-' || p_user_id::text,
      'TubeMilestones YouTube refresh credential'
    ) into v_secret_id;

    insert into public.youtube_token_vault (user_id, secret_id)
    values (p_user_id, v_secret_id)
    on conflict (user_id) do update set secret_id = excluded.secret_id;
  else
    perform vault.update_secret(
      v_secret_id,
      p_refresh_token,
      'tm-youtube-' || p_user_id::text,
      'TubeMilestones YouTube refresh credential'
    );
  end if;

  return v_secret_id;
end;
$$;

create or replace function public.read_youtube_refresh_token(p_user_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select ds.decrypted_secret
  from public.youtube_token_vault map
  join vault.decrypted_secrets ds on ds.id = map.secret_id
  where map.user_id = p_user_id
$$;

create or replace function public.delete_youtube_refresh_token(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  delete from public.youtube_token_vault
  where user_id = p_user_id
  returning secret_id into v_secret_id;

  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.consume_youtube_oauth_attempt(p_state_hash text)
returns table (user_id uuid, code_verifier text)
language sql
security definer
set search_path = ''
as $$
  update public.youtube_oauth_attempts attempt
  set used_at = now()
  where attempt.state_hash = p_state_hash
    and attempt.used_at is null
    and attempt.expires_at > now()
  returning attempt.user_id, attempt.code_verifier
$$;

create or replace function public.claim_youtube_sync(
  p_user_id uuid,
  p_manual boolean default true
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.youtube_connections%rowtype;
begin
  select * into v_connection
  from public.youtube_connections
  where user_id = p_user_id
  for update;

  if not found then return 'YOUTUBE_NOT_CONNECTED'; end if;
  if v_connection.status not in ('CONNECTED', 'SYNCING') then
    return case
      when v_connection.status = 'DELETION_PENDING' then 'DELETION_PENDING'
      else 'YOUTUBE_REAUTH_REQUIRED'
    end;
  end if;
  if v_connection.last_sync_started_at is not null
     and v_connection.last_sync_started_at > now() - interval '3 minutes'
     and v_connection.status = 'SYNCING' then
    return 'SYNC_IN_PROGRESS';
  end if;
  if p_manual and v_connection.last_synced_at is not null
     and v_connection.last_synced_at > now() - interval '5 minutes' then
    return 'SYNC_COOLDOWN';
  end if;

  update public.youtube_connections
  set status = 'SYNCING', last_sync_started_at = now(), last_sync_error_code = null
  where user_id = p_user_id;
  return 'CLAIMED';
end;
$$;

create or replace function public.finish_youtube_sync(
  p_user_id uuid,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.youtube_connections
  set status = case
        when p_error_code = 'YOUTUBE_REAUTH_REQUIRED' then 'REAUTH_REQUIRED'
        else 'CONNECTED'
      end,
      last_sync_started_at = null,
      last_synced_at = case when p_error_code is null then now() else last_synced_at end,
      last_sync_error_code = p_error_code
  where user_id = p_user_id and status <> 'DELETION_PENDING';
end;
$$;

create or replace function public.mark_milestone_celebration_seen(p_milestone_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.milestone_states
  set celebration_seen = true
  where id = p_milestone_id and user_id = (select auth.uid())
$$;

revoke execute on function public.store_youtube_refresh_token(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.read_youtube_refresh_token(uuid)
  from public, anon, authenticated;
revoke execute on function public.delete_youtube_refresh_token(uuid)
  from public, anon, authenticated;
revoke execute on function public.consume_youtube_oauth_attempt(text)
  from public, anon, authenticated;
revoke execute on function public.claim_youtube_sync(uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.finish_youtube_sync(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.mark_milestone_celebration_seen(uuid)
  from public, anon;

grant execute on function public.store_youtube_refresh_token(uuid, text) to service_role;
grant execute on function public.read_youtube_refresh_token(uuid) to service_role;
grant execute on function public.delete_youtube_refresh_token(uuid) to service_role;
grant execute on function public.consume_youtube_oauth_attempt(text) to service_role;
grant execute on function public.claim_youtube_sync(uuid, boolean) to service_role;
grant execute on function public.finish_youtube_sync(uuid, text) to service_role;
grant execute on function public.mark_milestone_celebration_seen(uuid) to authenticated;

-- Cron installation is explicit because project URLs and secret keys are environment-specific.
-- Store these two values in Vault, then call this function once as an administrator:
--   tubemilestones_project_url
--   tubemilestones_automation_secret
create or replace function public.install_tubemilestones_cron_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_automation_secret text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'tubemilestones_project_url';
  select decrypted_secret into v_automation_secret
  from vault.decrypted_secrets where name = 'tubemilestones_automation_secret';

  if v_project_url is null or v_automation_secret is null then
    raise exception 'required TubeMilestones Cron Vault configuration is missing';
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
    format(
      $job$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', %L),
        body := '{}'::jsonb
      );$job$,
      v_project_url || '/functions/v1/compliance-revalidate',
      v_automation_secret
    )
  );

  perform cron.schedule(
    'tubemilestones-deletion-worker',
    '15 3 * * *',
    format(
      $job$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', %L),
        body := '{}'::jsonb
      );$job$,
      v_project_url || '/functions/v1/deletion-worker',
      v_automation_secret
    )
  );
end;
$$;

revoke execute on function public.install_tubemilestones_cron_jobs()
  from public, anon, authenticated;
grant execute on function public.install_tubemilestones_cron_jobs() to service_role;

-- Keep default function privileges closed for future helpers in public.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
