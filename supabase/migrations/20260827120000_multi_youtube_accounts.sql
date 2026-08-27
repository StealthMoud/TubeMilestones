-- Refactor YouTube authorization from one connection per TubeMilestones user to
-- independently owned, connection-scoped credentials and channels.

-- Preserve any legacy channel/token rows even if their connection row is missing.
-- The generated legacy subject cannot be mistaken for a Google OpenID subject and
-- forces an explicit reconnect before provider access resumes.
alter table public.youtube_connections
  add column id uuid default gen_random_uuid(),
  add column google_subject text,
  add column google_email text;

update public.youtube_connections
set google_subject = 'legacy:' || user_id::text,
    status = 'REAUTH_REQUIRED',
    last_sync_error_code = 'LEGACY_IDENTITY_RECONNECT_REQUIRED'
where google_subject is null;

insert into public.youtube_connections (
  user_id,
  google_subject,
  status,
  last_sync_error_code
)
select legacy.user_id,
       'legacy:' || legacy.user_id::text,
       'REAUTH_REQUIRED',
       'LEGACY_IDENTITY_RECONNECT_REQUIRED'
from (
  select user_id from public.channels
  union
  select user_id from public.youtube_token_vault
) legacy
where not exists (
  select 1
  from public.youtube_connections connection
  where connection.user_id = legacy.user_id
);

alter table public.youtube_connections
  alter column id set not null,
  alter column google_subject set not null,
  drop constraint youtube_connections_pkey,
  add constraint youtube_connections_pkey primary key (id),
  add constraint youtube_connections_user_subject_key unique (user_id, google_subject),
  add constraint youtube_connections_user_id_id_key unique (user_id, id),
  add constraint youtube_connections_google_subject_check check (
    char_length(google_subject) between 1 and 255
  ),
  add constraint youtube_connections_google_email_check check (
    google_email is null or char_length(google_email) between 3 and 320
  );

create index youtube_connections_user_id_idx
  on public.youtube_connections(user_id, connected_at, id);

-- A channel keeps user_id for RLS/query locality while the composite foreign key
-- prevents a channel from being attached to another user's connection.
alter table public.channels add column connection_id uuid;

update public.channels channel
set connection_id = connection.id
from public.youtube_connections connection
where connection.user_id = channel.user_id
  and channel.connection_id is null;

alter table public.channels
  alter column connection_id set not null,
  add constraint channels_user_connection_fk
    foreign key (user_id, connection_id)
    references public.youtube_connections(user_id, id)
    on delete cascade;

create index channels_connection_id_idx
  on public.channels(user_id, connection_id, title, id);

-- Vault mappings now belong to an authorization connection, not an app user.
alter table public.youtube_token_vault add column connection_id uuid;

update public.youtube_token_vault mapping
set connection_id = connection.id
from public.youtube_connections connection
where connection.user_id = mapping.user_id
  and mapping.connection_id is null;

alter table public.youtube_token_vault
  alter column connection_id set not null,
  drop constraint youtube_token_vault_pkey,
  add constraint youtube_token_vault_pkey primary key (connection_id),
  add constraint youtube_token_vault_user_connection_fk
    foreign key (user_id, connection_id)
    references public.youtube_connections(user_id, id)
    on delete cascade;

do $$
declare
  v_mapping record;
begin
  for v_mapping in
    select connection_id, secret_id
    from public.youtube_token_vault
  loop
    perform vault.update_secret(
      v_mapping.secret_id,
      null,
      'tm-youtube-connection-' || v_mapping.connection_id::text,
      'TubeMilestones YouTube connection refresh credential'
    );
  end loop;
end;
$$;

-- OAuth state records whether the user is adding an account or reconnecting one.
alter table public.youtube_oauth_attempts
  add column target_connection_id uuid,
  add column intent text not null default 'ADD';

alter table public.youtube_oauth_attempts
  add constraint youtube_oauth_attempts_intent_check check (
    (intent = 'ADD' and target_connection_id is null)
    or (intent = 'RECONNECT' and target_connection_id is not null)
  ),
  add constraint youtube_oauth_attempts_user_connection_fk
    foreign key (user_id, target_connection_id)
    references public.youtube_connections(user_id, id)
    on delete cascade;

create index youtube_oauth_attempt_target_idx
  on public.youtube_oauth_attempts(user_id, target_connection_id)
  where used_at is null;

-- Scoped deletions retain their connection identifier after the connection row is
-- removed so the durable audit record remains retryable and reviewable.
alter table public.data_deletion_requests add column connection_id uuid;

update public.data_deletion_requests request
set connection_id = coalesce(
  (
    select connection.id
    from public.youtube_connections connection
    where connection.user_id = request.user_id
    order by connection.connected_at, connection.id
    limit 1
  ),
  gen_random_uuid()
)
where request.type in ('YOUTUBE_DISCONNECT', 'COMPLIANCE_REVOKED')
  and request.connection_id is null;

alter table public.data_deletion_requests
  add constraint data_deletion_requests_scope_check check (
    (type = 'ACCOUNT_DELETE' and connection_id is null)
    or (
      type in ('YOUTUBE_DISCONNECT', 'COMPLIANCE_REVOKED')
      and connection_id is not null
    )
  );

create unique index deletion_active_connection_unique
  on public.data_deletion_requests(user_id, connection_id, type)
  where status in ('PENDING', 'RUNNING', 'FAILED_RETRYABLE')
    and type in ('YOUTUBE_DISCONNECT', 'COMPLIANCE_REVOKED');

create unique index deletion_active_account_unique
  on public.data_deletion_requests(user_id, type)
  where status in ('PENDING', 'RUNNING', 'FAILED_RETRYABLE')
    and type = 'ACCOUNT_DELETE';

drop index if exists public.compliance_due_claim_idx;
create index compliance_due_claim_idx
  on public.youtube_connections (
    last_authorization_verified_at asc nulls first,
    id
  )
  include (user_id, last_verification_attempt_at, verification_claimed_at)
  where status in ('CONNECTED', 'SYNCING');

-- Replace every user-scoped credential/work helper. There is a short deployment
-- boundary between this migration and the matching Edge Function deployment; no
-- ambiguous compatibility overload is retained once multiple connections are legal.
drop function public.store_youtube_refresh_token(uuid, text);
drop function public.read_youtube_refresh_token(uuid);
drop function public.delete_youtube_refresh_token(uuid);
drop function public.consume_youtube_oauth_attempt(text);
drop function public.claim_youtube_sync(uuid, boolean);
drop function public.finish_youtube_sync(uuid, text);
drop function public.claim_due_compliance_connections(integer, uuid);
drop function public.claim_deletion_requests(integer, uuid);

create or replace function public.store_youtube_refresh_token(
  p_connection_id uuid,
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
    raise exception 'invalid refresh credential' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.youtube_connections connection
    where connection.id = p_connection_id
      and connection.user_id = p_user_id
  ) then
    raise exception 'YouTube connection is not owned by user' using errcode = '42501';
  end if;

  select mapping.secret_id into v_secret_id
  from public.youtube_token_vault mapping
  where mapping.connection_id = p_connection_id
    and mapping.user_id = p_user_id
  for update;

  if v_secret_id is null then
    select vault.create_secret(
      p_refresh_token,
      'tm-youtube-connection-' || p_connection_id::text,
      'TubeMilestones YouTube connection refresh credential'
    ) into v_secret_id;

    insert into public.youtube_token_vault (connection_id, user_id, secret_id)
    values (p_connection_id, p_user_id, v_secret_id)
    on conflict (connection_id) do update
      set secret_id = excluded.secret_id,
          user_id = excluded.user_id;
  else
    perform vault.update_secret(
      v_secret_id,
      p_refresh_token,
      'tm-youtube-connection-' || p_connection_id::text,
      'TubeMilestones YouTube connection refresh credential'
    );
  end if;

  return v_secret_id;
end;
$$;

create or replace function public.read_youtube_refresh_token(
  p_connection_id uuid,
  p_user_id uuid
)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select secret.decrypted_secret
  from public.youtube_token_vault mapping
  join public.youtube_connections connection
    on connection.id = mapping.connection_id
   and connection.user_id = mapping.user_id
  join vault.decrypted_secrets secret on secret.id = mapping.secret_id
  where mapping.connection_id = p_connection_id
    and mapping.user_id = p_user_id
$$;

create or replace function public.delete_youtube_refresh_token(
  p_connection_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  delete from public.youtube_token_vault mapping
  where mapping.connection_id = p_connection_id
    and mapping.user_id = p_user_id
  returning mapping.secret_id into v_secret_id;

  if v_secret_id is not null then
    delete from vault.secrets secret where secret.id = v_secret_id;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.consume_youtube_oauth_attempt(p_state_hash text)
returns table (
  user_id uuid,
  code_verifier text,
  intent text,
  target_connection_id uuid
)
language sql
security definer
set search_path = ''
as $$
  update public.youtube_oauth_attempts attempt
  set used_at = now()
  where attempt.state_hash = p_state_hash
    and attempt.used_at is null
    and attempt.expires_at > now()
  returning
    attempt.user_id,
    attempt.code_verifier,
    attempt.intent,
    attempt.target_connection_id
$$;

create or replace function public.claim_youtube_sync(
  p_connection_id uuid,
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
  from public.youtube_connections connection
  where connection.id = p_connection_id
    and connection.user_id = p_user_id
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

  update public.youtube_connections connection
  set status = 'SYNCING',
      last_sync_started_at = now(),
      last_sync_error_code = null
  where connection.id = p_connection_id
    and connection.user_id = p_user_id;
  return 'CLAIMED';
end;
$$;

create or replace function public.finish_youtube_sync(
  p_connection_id uuid,
  p_user_id uuid,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.youtube_connections connection
  set status = case
        when p_error_code = 'YOUTUBE_REAUTH_REQUIRED' then 'REAUTH_REQUIRED'
        else 'CONNECTED'
      end,
      last_sync_started_at = null,
      last_synced_at = case
        when p_error_code is null then now()
        else connection.last_synced_at
      end,
      last_sync_error_code = p_error_code
  where connection.id = p_connection_id
    and connection.user_id = p_user_id
    and connection.status <> 'DELETION_PENDING';
end;
$$;

-- Upsert only channels that are unclaimed or already belong to this connection.
-- A conflict through another connection is deliberately preserved and omitted.
create or replace function public.upsert_youtube_connection_channels(
  p_user_id uuid,
  p_connection_id uuid,
  p_channels jsonb
)
returns setof public.channels
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.youtube_connections connection
    where connection.id = p_connection_id
      and connection.user_id = p_user_id
  ) then
    raise exception 'YouTube connection is not owned by user' using errcode = '42501';
  end if;
  if jsonb_typeof(p_channels) <> 'array'
     or jsonb_array_length(p_channels) < 1
     or jsonb_array_length(p_channels) > 50 then
    raise exception 'invalid YouTube channel payload' using errcode = '22023';
  end if;

  return query
  with incoming_raw as (
    select *
    from jsonb_to_recordset(p_channels) as channel(
      youtube_channel_id text,
      title text,
      thumbnail_url text,
      published_at timestamptz,
      subscriber_count bigint,
      subscriber_count_precision text,
      hidden_subscriber_count boolean,
      view_count bigint,
      video_count bigint,
      uploads_playlist_id text,
      last_observed_at timestamptz
    )
  ),
  incoming as (
    select distinct on (youtube_channel_id) *
    from incoming_raw
    where youtube_channel_id is not null
      and youtube_channel_id <> ''
      and title is not null
      and title <> ''
    order by youtube_channel_id
  ),
  stored as (
    insert into public.channels (
      user_id,
      connection_id,
      youtube_channel_id,
      title,
      thumbnail_url,
      published_at,
      subscriber_count,
      subscriber_count_precision,
      hidden_subscriber_count,
      view_count,
      video_count,
      uploads_playlist_id,
      last_observed_at
    )
    select
      p_user_id,
      p_connection_id,
      incoming.youtube_channel_id,
      incoming.title,
      coalesce(incoming.thumbnail_url, ''),
      incoming.published_at,
      incoming.subscriber_count,
      incoming.subscriber_count_precision,
      coalesce(incoming.hidden_subscriber_count, false),
      incoming.view_count,
      incoming.video_count,
      coalesce(incoming.uploads_playlist_id, ''),
      incoming.last_observed_at
    from incoming
    on conflict (user_id, youtube_channel_id) do update
    set title = excluded.title,
        thumbnail_url = excluded.thumbnail_url,
        published_at = excluded.published_at,
        subscriber_count = excluded.subscriber_count,
        subscriber_count_precision = excluded.subscriber_count_precision,
        hidden_subscriber_count = excluded.hidden_subscriber_count,
        view_count = excluded.view_count,
        video_count = excluded.video_count,
        uploads_playlist_id = excluded.uploads_playlist_id,
        last_observed_at = excluded.last_observed_at
    where public.channels.connection_id = excluded.connection_id
    returning public.channels.*
  )
  select stored.* from stored;
end;
$$;

-- OAuth completion is one database transaction: identity resolution, connection
-- lifecycle, Vault rotation, channel attachment, and initial selection either all
-- commit or all roll back together.
create or replace function public.complete_youtube_oauth_connection(
  p_user_id uuid,
  p_intent text,
  p_target_connection_id uuid,
  p_google_subject text,
  p_google_email text,
  p_refresh_token text,
  p_granted_scopes text[],
  p_channels jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.youtube_connections%rowtype;
  v_connection_id uuid;
  v_new_connection boolean := false;
  v_before_count integer := 0;
  v_after_count integer := 0;
  v_other_count integer := 0;
  v_available_count integer := 0;
  v_selected_channel_id uuid;
begin
  if p_intent not in ('ADD', 'RECONNECT')
     or (p_intent = 'ADD' and p_target_connection_id is not null)
     or (p_intent = 'RECONNECT' and p_target_connection_id is null) then
    raise exception 'invalid OAuth completion intent' using errcode = '22023';
  end if;
  if p_google_subject is null
     or char_length(p_google_subject) not between 1 and 255
     or p_google_subject like 'legacy:%' then
    raise exception 'invalid Google subject' using errcode = '22023';
  end if;
  if p_google_email is not null
     and char_length(p_google_email) not between 3 and 320 then
    raise exception 'invalid Google email' using errcode = '22023';
  end if;
  if jsonb_typeof(p_channels) <> 'array' or jsonb_array_length(p_channels) < 1 then
    raise exception 'at least one YouTube channel is required' using errcode = '22023';
  end if;

  if p_intent = 'RECONNECT' then
    select * into v_connection
    from public.youtube_connections connection
    where connection.id = p_target_connection_id
      and connection.user_id = p_user_id
    for update;

    if not found then
      return jsonb_build_object('outcome', 'FORBIDDEN');
    end if;
    if v_connection.status = 'DELETION_PENDING' then
      return jsonb_build_object('outcome', 'DELETION_PENDING');
    end if;
    if v_connection.google_subject not like 'legacy:%'
       and v_connection.google_subject <> p_google_subject then
      return jsonb_build_object('outcome', 'ACCOUNT_MISMATCH');
    end if;
    if v_connection.google_subject like 'legacy:%'
       and exists (
         select 1
         from public.youtube_connections other
         where other.user_id = p_user_id
           and other.google_subject = p_google_subject
           and other.id <> v_connection.id
       ) then
      return jsonb_build_object('outcome', 'ACCOUNT_MISMATCH');
    end if;
    v_connection_id := v_connection.id;
  else
    select * into v_connection
    from public.youtube_connections connection
    where connection.user_id = p_user_id
      and connection.google_subject = p_google_subject
    for update;

    if found then
      if v_connection.status = 'DELETION_PENDING' then
        return jsonb_build_object('outcome', 'DELETION_PENDING');
      end if;
      v_connection_id := v_connection.id;
    else
      with incoming as (
        select distinct value ->> 'youtube_channel_id' as youtube_channel_id
        from jsonb_array_elements(p_channels) value
      )
      select count(*) into v_available_count
      from incoming
      where youtube_channel_id is not null
        and youtube_channel_id <> ''
        and not exists (
          select 1
          from public.channels existing
          where existing.user_id = p_user_id
            and existing.youtube_channel_id = incoming.youtube_channel_id
        );

      if v_available_count = 0 then
        return jsonb_build_object('outcome', 'CHANNELS_ALREADY_CONNECTED');
      end if;

      insert into public.youtube_connections (
        user_id,
        google_subject,
        google_email,
        status,
        connected_at,
        last_authorization_verified_at,
        last_verification_attempt_at,
        verification_retry_count,
        granted_scopes,
        last_sync_error_code
      ) values (
        p_user_id,
        p_google_subject,
        p_google_email,
        'CONNECTED',
        now(),
        now(),
        now(),
        0,
        p_granted_scopes,
        null
      )
      returning * into v_connection;
      v_connection_id := v_connection.id;
      v_new_connection := true;
    end if;
  end if;

  select count(*) into v_before_count
  from public.channels channel
  where channel.user_id = p_user_id
    and channel.connection_id = v_connection_id;

  with incoming as (
    select distinct value ->> 'youtube_channel_id' as youtube_channel_id
    from jsonb_array_elements(p_channels) value
  )
  select count(*) into v_other_count
  from incoming
  join public.channels existing
    on existing.user_id = p_user_id
   and existing.youtube_channel_id = incoming.youtube_channel_id
   and existing.connection_id <> v_connection_id;

  update public.youtube_connections connection
  set google_subject = p_google_subject,
      google_email = p_google_email,
      status = 'CONNECTED',
      last_authorization_verified_at = now(),
      last_verification_attempt_at = now(),
      verification_retry_count = 0,
      verification_claim_id = null,
      verification_claimed_at = null,
      granted_scopes = p_granted_scopes,
      last_sync_error_code = null
  where connection.id = v_connection_id
    and connection.user_id = p_user_id;

  perform public.store_youtube_refresh_token(
    v_connection_id,
    p_user_id,
    p_refresh_token
  );

  perform public.upsert_youtube_connection_channels(
    p_user_id,
    v_connection_id,
    p_channels
  );

  select count(*) into v_after_count
  from public.channels channel
  where channel.user_id = p_user_id
    and channel.connection_id = v_connection_id;

  if v_new_connection and v_after_count = 0 then
    raise exception 'new YouTube connection has no attachable channels';
  end if;

  select profile.selected_channel_id into v_selected_channel_id
  from public.profiles profile
  where profile.user_id = p_user_id
  for update;

  if v_selected_channel_id is null and v_after_count = 1 then
    select channel.id into v_selected_channel_id
    from public.channels channel
    where channel.user_id = p_user_id
      and channel.connection_id = v_connection_id
    order by channel.created_at, channel.id
    limit 1;

    update public.profiles profile
    set selected_channel_id = v_selected_channel_id
    where profile.user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'outcome', 'CONNECTED',
    'connectionId', v_connection_id,
    'channelsAdded', greatest(v_after_count - v_before_count, 0),
    'channelsAlreadyTracked', v_other_count,
    'selectedChannelId', v_selected_channel_id
  );
end;
$$;

create or replace function public.claim_due_compliance_connections(
  p_batch_size integer,
  p_claim_id uuid
)
returns table (
  connection_id uuid,
  user_id uuid,
  status text,
  last_authorization_verified_at timestamptz,
  verification_retry_count integer,
  granted_scopes text[],
  verification_claim_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 100 then
    raise exception 'compliance batch size must be between 1 and 100'
      using errcode = '22023';
  end if;
  if p_claim_id is null then
    raise exception 'compliance claim id is required' using errcode = '22023';
  end if;

  return query
  with candidates as materialized (
    select connection.id
    from public.youtube_connections connection
    where connection.status in ('CONNECTED', 'SYNCING')
      and (
        connection.last_authorization_verified_at is null
        or connection.last_authorization_verified_at <= now() - interval '25 days'
      )
      and (
        connection.last_verification_attempt_at is null
        or connection.last_verification_attempt_at <= now() - interval '23 hours'
      )
      and (
        connection.verification_claimed_at is null
        or connection.verification_claimed_at <= now() - interval '10 minutes'
      )
    order by
      connection.last_authorization_verified_at asc nulls first,
      connection.id
    for update skip locked
    limit p_batch_size
  ),
  claimed as (
    update public.youtube_connections connection
    set verification_claim_id = p_claim_id,
        verification_claimed_at = now()
    from candidates
    where connection.id = candidates.id
    returning connection.*
  )
  select
    claimed.id,
    claimed.user_id,
    claimed.status,
    claimed.last_authorization_verified_at,
    claimed.verification_retry_count,
    claimed.granted_scopes,
    claimed.verification_claim_id
  from claimed
  order by
    claimed.last_authorization_verified_at asc nulls first,
    claimed.id;
end;
$$;

create or replace function public.claim_deletion_requests(
  p_batch_size integer,
  p_claim_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  connection_id uuid,
  type text,
  requested_at timestamptz,
  attempts integer,
  claim_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 100 then
    raise exception 'deletion batch size must be between 1 and 100'
      using errcode = '22023';
  end if;
  if p_claim_id is null then
    raise exception 'deletion claim id is required' using errcode = '22023';
  end if;

  return query
  with candidates as materialized (
    select request.id
    from public.data_deletion_requests request
    where request.status in ('PENDING', 'FAILED_RETRYABLE')
      or (
        request.status = 'RUNNING'
        and (
          request.started_at is null
          or request.started_at <= now() - interval '15 minutes'
        )
      )
    order by request.requested_at, request.id
    for update skip locked
    limit p_batch_size
  ),
  claimed as (
    update public.data_deletion_requests request
    set status = 'RUNNING',
        claim_id = p_claim_id,
        started_at = now(),
        completed_at = null,
        last_error = null,
        attempts = request.attempts + 1
    from candidates
    where request.id = candidates.id
    returning request.*
  )
  select
    claimed.id,
    claimed.user_id,
    claimed.connection_id,
    claimed.type,
    claimed.requested_at,
    claimed.attempts,
    claimed.claim_id
  from claimed
  order by claimed.requested_at, claimed.id;
end;
$$;

revoke execute on function public.store_youtube_refresh_token(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.read_youtube_refresh_token(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.delete_youtube_refresh_token(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.consume_youtube_oauth_attempt(text)
  from public, anon, authenticated;
revoke execute on function public.claim_youtube_sync(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.finish_youtube_sync(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.upsert_youtube_connection_channels(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.complete_youtube_oauth_connection(
  uuid, text, uuid, text, text, text, text[], jsonb
) from public, anon, authenticated;
revoke execute on function public.claim_due_compliance_connections(integer, uuid)
  from public, anon, authenticated;
revoke execute on function public.claim_deletion_requests(integer, uuid)
  from public, anon, authenticated;

grant execute on function public.store_youtube_refresh_token(uuid, uuid, text)
  to service_role;
grant execute on function public.read_youtube_refresh_token(uuid, uuid)
  to service_role;
grant execute on function public.delete_youtube_refresh_token(uuid, uuid)
  to service_role;
grant execute on function public.consume_youtube_oauth_attempt(text)
  to service_role;
grant execute on function public.claim_youtube_sync(uuid, uuid, boolean)
  to service_role;
grant execute on function public.finish_youtube_sync(uuid, uuid, text)
  to service_role;
grant execute on function public.upsert_youtube_connection_channels(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.complete_youtube_oauth_connection(
  uuid, text, uuid, text, text, text, text[], jsonb
) to service_role;
grant execute on function public.claim_due_compliance_connections(integer, uuid)
  to service_role;
grant execute on function public.claim_deletion_requests(integer, uuid)
  to service_role;
