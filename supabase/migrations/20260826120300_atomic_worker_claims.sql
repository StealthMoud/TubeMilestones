-- Add recoverable, ownership-bound claims for scheduled compliance and deletion work.

alter table public.youtube_connections
  add column verification_claim_id uuid,
  add column verification_claimed_at timestamptz;

alter table public.data_deletion_requests
  add column claim_id uuid;

drop index if exists public.compliance_verification_idx;
create index compliance_due_claim_idx
  on public.youtube_connections (
    last_authorization_verified_at asc nulls first,
    user_id
  )
  include (last_verification_attempt_at, verification_claimed_at)
  where status in ('CONNECTED', 'SYNCING');

drop index if exists public.deletion_retry_idx;
create index deletion_claim_idx
  on public.data_deletion_requests (requested_at, id)
  include (started_at)
  where status in ('PENDING', 'FAILED_RETRYABLE', 'RUNNING');

create or replace function public.claim_due_compliance_connections(
  p_batch_size integer,
  p_claim_id uuid
)
returns table (
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
    select connection.user_id
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
      connection.user_id
    for update skip locked
    limit p_batch_size
  ),
  claimed as (
    update public.youtube_connections connection
    set verification_claim_id = p_claim_id,
        verification_claimed_at = now()
    from candidates
    where connection.user_id = candidates.user_id
    returning connection.*
  )
  select
    claimed.user_id,
    claimed.status,
    claimed.last_authorization_verified_at,
    claimed.verification_retry_count,
    claimed.granted_scopes,
    claimed.verification_claim_id
  from claimed
  order by
    claimed.last_authorization_verified_at asc nulls first,
    claimed.user_id;
end;
$$;

create or replace function public.claim_deletion_requests(
  p_batch_size integer,
  p_claim_id uuid
)
returns table (
  id uuid,
  user_id uuid,
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
    claimed.type,
    claimed.requested_at,
    claimed.attempts,
    claimed.claim_id
  from claimed
  order by claimed.requested_at, claimed.id;
end;
$$;

revoke execute on function public.claim_due_compliance_connections(integer, uuid)
  from public, anon, authenticated;
revoke execute on function public.claim_deletion_requests(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_due_compliance_connections(integer, uuid)
  to service_role;
grant execute on function public.claim_deletion_requests(integer, uuid)
  to service_role;
