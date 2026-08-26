-- TubeMilestones hot-data model, least-privilege grants, and row ownership rules.
-- Google credentials are deliberately absent from normal public tables.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'dark', 'light')),
  selected_channel_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.youtube_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'CONNECTED' check (
    status in (
      'CONNECTED',
      'SYNCING',
      'REAUTH_REQUIRED',
      'COMPLIANCE_HOLD',
      'DELETION_PENDING'
    )
  ),
  connected_at timestamptz not null default now(),
  last_authorization_verified_at timestamptz,
  last_verification_attempt_at timestamptz,
  verification_retry_count integer not null default 0 check (verification_retry_count >= 0),
  last_synced_at timestamptz,
  last_sync_started_at timestamptz,
  last_sync_error_code text,
  granted_scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.youtube_token_vault (
  user_id uuid primary key references auth.users(id) on delete cascade,
  secret_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  youtube_channel_id text not null,
  title text not null,
  thumbnail_url text not null default '',
  published_at timestamptz not null,
  subscriber_count bigint check (subscriber_count is null or subscriber_count >= 0),
  subscriber_count_precision text not null check (
    subscriber_count_precision in ('EXACT', 'ROUNDED_THREE_SIGNIFICANT_FIGURES', 'HIDDEN')
  ),
  hidden_subscriber_count boolean not null default false,
  view_count bigint not null check (view_count >= 0),
  video_count bigint not null check (video_count >= 0),
  uploads_playlist_id text not null default '',
  last_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, youtube_channel_id)
);

alter table public.profiles
  add constraint profiles_selected_channel_fk
  foreign key (selected_channel_id) references public.channels(id) on delete set null;

create table public.channel_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  snapshot_date date not null,
  observed_at timestamptz not null,
  subscriber_count bigint check (subscriber_count is null or subscriber_count >= 0),
  view_count bigint not null check (view_count >= 0),
  video_count bigint not null check (video_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, channel_id, snapshot_date)
);

create table public.analytics_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  day date not null,
  views bigint not null check (views >= 0),
  estimated_minutes_watched numeric not null check (estimated_minutes_watched >= 0),
  subscribers_gained bigint not null check (subscribers_gained >= 0),
  subscribers_lost bigint not null check (subscribers_lost >= 0),
  average_view_duration numeric not null check (average_view_duration >= 0),
  average_view_percentage numeric not null check (average_view_percentage >= 0),
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, channel_id, day)
);

create table public.analytics_summary (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid primary key references public.channels(id) on delete cascade,
  requested_start_date date not null,
  requested_end_date date not null,
  available_through date,
  estimated_minutes_watched numeric not null check (estimated_minutes_watched >= 0),
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.milestone_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  metric text not null check (metric in ('subscribers', 'views', 'uploads', 'watchHours')),
  target numeric not null check (
    target > 0
    and target <= 9007199254740991
    and (metric = 'watchHours' or target = trunc(target))
  ),
  status text not null check (status in ('ACHIEVED', 'NEXT', 'FUTURE')),
  detection_type text not null check (
    detection_type in ('PREEXISTING', 'TRACKED_CROSSING', 'USER_CREATED_ALREADY_COMPLETE')
  ),
  detected_at timestamptz,
  celebration_seen boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.custom_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  metric text not null check (metric in ('subscribers', 'views', 'uploads', 'watchHours')),
  target numeric not null check (
    target > 0
    and target <= 9007199254740991
    and (metric = 'watchHours' or target = trunc(target))
  ),
  title text check (title is null or char_length(title) between 1 and 120),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.milestone_states
  add column custom_goal_id uuid references public.custom_goals(id) on delete cascade;

create unique index milestone_states_standard_unique
  on public.milestone_states(user_id, channel_id, metric, target)
  where custom_goal_id is null;
create unique index milestone_states_custom_unique
  on public.milestone_states(user_id, custom_goal_id)
  where custom_goal_id is not null;

create table public.manual_metrics (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid primary key references public.channels(id) on delete cascade,
  qualified_public_watch_hours numeric check (
    qualified_public_watch_hours is null
    or qualified_public_watch_hours between 0 and 9007199254740991
  ),
  qualified_shorts_views bigint check (
    qualified_shorts_views is null
    or qualified_shorts_views between 0 and 9007199254740991
  ),
  updated_at timestamptz not null default now()
);

create table public.archive_manifests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  object_key text not null unique,
  format_version integer not null check (format_version > 0),
  key_version integer not null check (key_version > 0),
  analytics_row_count integer not null check (analytics_row_count >= 0),
  snapshot_row_count integer not null check (snapshot_row_count >= 0),
  compressed_size_bytes bigint,
  encrypted_size_bytes bigint,
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  status text not null check (
    status in ('WRITING', 'UPLOADED', 'VERIFIED', 'READY', 'DELETE_PENDING', 'ERROR')
  ),
  last_error_code text,
  archived_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_start <= period_end),
  unique (user_id, channel_id, period_start, period_end)
);

create table public.youtube_oauth_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  code_verifier text not null check (char_length(code_verifier) between 43 and 128),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at)
);

create table public.data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately not a foreign key: an account-deletion request must remain
  -- auditable until the worker records completion after auth.users is removed.
  user_id uuid not null,
  type text not null check (
    type in ('YOUTUBE_DISCONNECT', 'ACCOUNT_DELETE', 'COMPLIANCE_REVOKED')
  ),
  status text not null default 'PENDING' check (
    status in ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED_RETRYABLE', 'FAILED_FINAL')
  ),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

create index channels_user_id_idx on public.channels(user_id);
create index channel_snapshots_history_idx
  on public.channel_snapshots(user_id, channel_id, snapshot_date);
create index analytics_daily_history_idx
  on public.analytics_daily(user_id, channel_id, day);
create index milestone_states_owner_idx
  on public.milestone_states(user_id, channel_id);
create index custom_goals_owner_idx on public.custom_goals(user_id, channel_id);
create index archive_manifests_history_idx
  on public.archive_manifests(user_id, channel_id, period_start);
create index oauth_attempt_expiry_idx
  on public.youtube_oauth_attempts(expires_at)
  where used_at is null;
create index deletion_retry_idx
  on public.data_deletion_requests(status, requested_at)
  where status in ('PENDING', 'FAILED_RETRYABLE');
create index compliance_verification_idx
  on public.youtube_connections(last_authorization_verified_at)
  where status in ('CONNECTED', 'SYNCING');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger youtube_connections_updated_at before update on public.youtube_connections
for each row execute function public.set_updated_at();
create trigger youtube_token_vault_updated_at before update on public.youtube_token_vault
for each row execute function public.set_updated_at();
create trigger channels_updated_at before update on public.channels
for each row execute function public.set_updated_at();
create trigger channel_snapshots_updated_at before update on public.channel_snapshots
for each row execute function public.set_updated_at();
create trigger analytics_daily_updated_at before update on public.analytics_daily
for each row execute function public.set_updated_at();
create trigger analytics_summary_updated_at before update on public.analytics_summary
for each row execute function public.set_updated_at();
create trigger milestone_states_updated_at before update on public.milestone_states
for each row execute function public.set_updated_at();
create trigger custom_goals_updated_at before update on public.custom_goals
for each row execute function public.set_updated_at();
create trigger archive_manifests_updated_at before update on public.archive_manifests
for each row execute function public.set_updated_at();
create trigger data_deletion_requests_updated_at before update on public.data_deletion_requests
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.validate_selected_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.selected_channel_id is not null and not exists (
    select 1
    from public.channels c
    where c.id = new.selected_channel_id and c.user_id = new.user_id
  ) then
    raise exception 'selected channel is not owned by profile user';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_selected_channel
before insert or update of selected_channel_id on public.profiles
for each row execute function public.validate_selected_channel();

alter table public.profiles enable row level security;
alter table public.youtube_connections enable row level security;
alter table public.youtube_token_vault enable row level security;
alter table public.channels enable row level security;
alter table public.channel_snapshots enable row level security;
alter table public.analytics_daily enable row level security;
alter table public.analytics_summary enable row level security;
alter table public.milestone_states enable row level security;
alter table public.custom_goals enable row level security;
alter table public.manual_metrics enable row level security;
alter table public.archive_manifests enable row level security;
alter table public.youtube_oauth_attempts enable row level security;
alter table public.data_deletion_requests enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.youtube_connections from anon, authenticated;
revoke all on table public.youtube_token_vault from anon, authenticated;
revoke all on table public.channels from anon, authenticated;
revoke all on table public.channel_snapshots from anon, authenticated;
revoke all on table public.analytics_daily from anon, authenticated;
revoke all on table public.analytics_summary from anon, authenticated;
revoke all on table public.milestone_states from anon, authenticated;
revoke all on table public.custom_goals from anon, authenticated;
revoke all on table public.manual_metrics from anon, authenticated;
revoke all on table public.archive_manifests from anon, authenticated;
revoke all on table public.youtube_oauth_attempts from anon, authenticated;
revoke all on table public.data_deletion_requests from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (theme, selected_channel_id) on table public.profiles to authenticated;
grant select on table public.youtube_connections to authenticated;
grant select on table public.channels to authenticated;
grant select on table public.channel_snapshots to authenticated;
grant select on table public.analytics_daily to authenticated;
grant select on table public.analytics_summary to authenticated;
grant select on table public.milestone_states to authenticated;
grant select, insert, update, delete on table public.custom_goals to authenticated;
grant select, insert, update, delete on table public.manual_metrics to authenticated;
grant select on table public.archive_manifests to authenticated;

create policy profiles_select_own on public.profiles
for select to authenticated
using ((select auth.uid()) = user_id);

create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy youtube_connections_select_own on public.youtube_connections
for select to authenticated
using ((select auth.uid()) = user_id);

create policy channels_select_own on public.channels
for select to authenticated
using ((select auth.uid()) = user_id);

create policy channel_snapshots_select_own on public.channel_snapshots
for select to authenticated
using ((select auth.uid()) = user_id);

create policy analytics_daily_select_own on public.analytics_daily
for select to authenticated
using ((select auth.uid()) = user_id);

create policy analytics_summary_select_own on public.analytics_summary
for select to authenticated
using ((select auth.uid()) = user_id);

create policy milestone_states_select_own on public.milestone_states
for select to authenticated
using ((select auth.uid()) = user_id);

create policy custom_goals_select_own on public.custom_goals
for select to authenticated
using ((select auth.uid()) = user_id);
create policy custom_goals_insert_own on public.custom_goals
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.channels c
    where c.id = channel_id and c.user_id = (select auth.uid())
  )
);
create policy custom_goals_update_own on public.custom_goals
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.channels c
    where c.id = channel_id and c.user_id = (select auth.uid())
  )
);
create policy custom_goals_delete_own on public.custom_goals
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy manual_metrics_select_own on public.manual_metrics
for select to authenticated
using ((select auth.uid()) = user_id);
create policy manual_metrics_insert_own on public.manual_metrics
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.channels c
    where c.id = channel_id and c.user_id = (select auth.uid())
  )
);
create policy manual_metrics_update_own on public.manual_metrics
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.channels c
    where c.id = channel_id and c.user_id = (select auth.uid())
  )
);
create policy manual_metrics_delete_own on public.manual_metrics
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy archive_manifests_select_own on public.archive_manifests
for select to authenticated
using ((select auth.uid()) = user_id);

-- Server-only tables intentionally have RLS enabled and no browser policies:
-- youtube_token_vault, youtube_oauth_attempts, and data_deletion_requests.

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.validate_selected_channel() from public, anon, authenticated;
