begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('60000000-0000-4000-8000-000000000001', 'multi-1@example.test', '{}'),
  ('60000000-0000-4000-8000-000000000002', 'multi-2@example.test', '{}');

select is(
  public.complete_youtube_oauth_connection(
    '60000000-0000-4000-8000-000000000001',
    'ADD',
    null,
    'google-subject-a',
    'account-a@example.test',
    'refresh-token-account-a-1234567890',
    array[
      'openid',
      'email',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ],
    '[{
      "youtube_channel_id":"youtube-channel-a",
      "title":"Channel A",
      "thumbnail_url":"https://example.test/a.png",
      "published_at":"2020-01-01T00:00:00Z",
      "subscriber_count":100,
      "subscriber_count_precision":"EXACT",
      "hidden_subscriber_count":false,
      "view_count":1000,
      "video_count":10,
      "uploads_playlist_id":"uploads-a",
      "last_observed_at":"2026-08-27T00:00:00Z"
    }]'::jsonb
  ) ->> 'outcome',
  'CONNECTED',
  'the first Google identity creates connection A'
);

select is(
  public.complete_youtube_oauth_connection(
    '60000000-0000-4000-8000-000000000001',
    'ADD',
    null,
    'google-subject-b',
    'account-b@example.test',
    'refresh-token-account-b-1234567890',
    array[
      'openid',
      'email',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ],
    '[{
      "youtube_channel_id":"youtube-channel-b",
      "title":"Channel B",
      "thumbnail_url":"https://example.test/b.png",
      "published_at":"2021-01-01T00:00:00Z",
      "subscriber_count":200,
      "subscriber_count_precision":"EXACT",
      "hidden_subscriber_count":false,
      "view_count":2000,
      "video_count":20,
      "uploads_playlist_id":"uploads-b",
      "last_observed_at":"2026-08-27T00:00:00Z"
    }]'::jsonb
  ) ->> 'outcome',
  'CONNECTED',
  'the same TubeMilestones user can add connection B'
);

select is(
  public.complete_youtube_oauth_connection(
    '60000000-0000-4000-8000-000000000002',
    'ADD',
    null,
    'google-subject-b',
    'account-b@example.test',
    'refresh-token-other-user-b-1234567890',
    array[
      'openid',
      'email',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ],
    '[{
      "youtube_channel_id":"youtube-channel-b",
      "title":"Other owner channel B",
      "thumbnail_url":"https://example.test/other-b.png",
      "published_at":"2022-01-01T00:00:00Z",
      "subscriber_count":300,
      "subscriber_count_precision":"EXACT",
      "hidden_subscriber_count":false,
      "view_count":3000,
      "video_count":30,
      "uploads_playlist_id":"uploads-other-b",
      "last_observed_at":"2026-08-27T00:00:00Z"
    }]'::jsonb
  ) ->> 'outcome',
  'CONNECTED',
  'another TubeMilestones user may connect the same Google subject'
);

select is(
  (
    select count(*)::integer
    from public.youtube_connections
    where user_id = '60000000-0000-4000-8000-000000000001'
  ),
  2,
  'one TubeMilestones user owns two independent YouTube connections'
);
select is(
  (
    select count(*)::integer
    from public.youtube_connections
    where google_subject = 'google-subject-b'
  ),
  2,
  'the same Google subject is isolated by TubeMilestones user'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.youtube_connections'::regclass
      and conname = 'youtube_connections_user_subject_key'
      and contype = 'u'
  ),
  'Google identity uniqueness is enforced per TubeMilestones user'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.channels'::regclass
      and conname = 'channels_user_id_youtube_channel_id_key'
      and contype = 'u'
  ),
  'YouTube channel uniqueness remains scoped to TubeMilestones user'
);

select is(
  (select count(*)::integer from public.youtube_token_vault),
  3,
  'every connection has its own Vault mapping'
);
select is(
  (select count(distinct secret_id)::integer from public.youtube_token_vault),
  3,
  'no two connections share a Vault secret'
);
select is(
  public.read_youtube_refresh_token(
    (
      select id from public.youtube_connections
      where user_id = '60000000-0000-4000-8000-000000000001'
        and google_subject = 'google-subject-a'
    ),
    '60000000-0000-4000-8000-000000000001'
  ),
  'refresh-token-account-a-1234567890',
  'connection A reads only token A'
);
select is(
  public.read_youtube_refresh_token(
    (
      select id from public.youtube_connections
      where user_id = '60000000-0000-4000-8000-000000000001'
        and google_subject = 'google-subject-b'
    ),
    '60000000-0000-4000-8000-000000000001'
  ),
  'refresh-token-account-b-1234567890',
  'connection B reads only token B'
);

select is(
  (
    select connection.google_subject
    from public.channels channel
    join public.youtube_connections connection on connection.id = channel.connection_id
    where channel.user_id = '60000000-0000-4000-8000-000000000001'
      and channel.youtube_channel_id = 'youtube-channel-a'
  ),
  'google-subject-a',
  'channel A belongs to connection A'
);
select is(
  (
    select connection.google_subject
    from public.channels channel
    join public.youtube_connections connection on connection.id = channel.connection_id
    where channel.user_id = '60000000-0000-4000-8000-000000000001'
      and channel.youtube_channel_id = 'youtube-channel-b'
  ),
  'google-subject-b',
  'channel B belongs to connection B'
);
select is(
  (
    select connection.google_subject
    from public.channels channel
    join public.youtube_connections connection on connection.id = channel.connection_id
    where channel.user_id = '60000000-0000-4000-8000-000000000002'
      and channel.youtube_channel_id = 'youtube-channel-b'
  ),
  'google-subject-b',
  'the same channel identifier may be isolated under another user'
);

select is(
  (
    select count(*)::integer
    from public.upsert_youtube_connection_channels(
      '60000000-0000-4000-8000-000000000001',
      (
        select id from public.youtube_connections
        where user_id = '60000000-0000-4000-8000-000000000001'
          and google_subject = 'google-subject-b'
      ),
      '[{
        "youtube_channel_id":"youtube-channel-a",
        "title":"Attempted reassignment",
        "thumbnail_url":"",
        "published_at":"2020-01-01T00:00:00Z",
        "subscriber_count":999,
        "subscriber_count_precision":"EXACT",
        "hidden_subscriber_count":false,
        "view_count":999,
        "video_count":99,
        "uploads_playlist_id":"uploads-a",
        "last_observed_at":"2026-08-27T00:00:00Z"
      }]'::jsonb
    )
  ),
  0,
  'a channel conflict through another connection is skipped'
);
select is(
  (
    select connection.google_subject
    from public.channels channel
    join public.youtube_connections connection on connection.id = channel.connection_id
    where channel.user_id = '60000000-0000-4000-8000-000000000001'
      and channel.youtube_channel_id = 'youtube-channel-a'
  ),
  'google-subject-a',
  'a skipped conflict never silently reassigns the channel'
);

select is(
  public.complete_youtube_oauth_connection(
    '60000000-0000-4000-8000-000000000001',
    'RECONNECT',
    (
      select id from public.youtube_connections
      where user_id = '60000000-0000-4000-8000-000000000001'
        and google_subject = 'google-subject-b'
    ),
    'google-subject-a',
    'account-a@example.test',
    'wrong-account-refresh-token-1234567890',
    array['openid', 'email'],
    '[{
      "youtube_channel_id":"youtube-channel-a",
      "title":"Channel A",
      "published_at":"2020-01-01T00:00:00Z",
      "subscriber_count":100,
      "subscriber_count_precision":"EXACT",
      "hidden_subscriber_count":false,
      "view_count":1000,
      "video_count":10,
      "last_observed_at":"2026-08-27T00:00:00Z"
    }]'::jsonb
  ) ->> 'outcome',
  'ACCOUNT_MISMATCH',
  'reconnect rejects a different Google identity'
);
select is(
  (
    select google_subject from public.youtube_connections
    where user_id = '60000000-0000-4000-8000-000000000001'
      and google_subject = 'google-subject-b'
  ),
  'google-subject-b',
  'an identity mismatch leaves connection B unchanged'
);
select is(
  public.read_youtube_refresh_token(
    (
      select id from public.youtube_connections
      where user_id = '60000000-0000-4000-8000-000000000001'
        and google_subject = 'google-subject-b'
    ),
    '60000000-0000-4000-8000-000000000001'
  ),
  'refresh-token-account-b-1234567890',
  'an identity mismatch leaves token B unchanged'
);

select is(
  public.claim_youtube_sync(
    (
      select id from public.youtube_connections
      where user_id = '60000000-0000-4000-8000-000000000001'
        and google_subject = 'google-subject-a'
    ),
    '60000000-0000-4000-8000-000000000001',
    false
  ),
  'CLAIMED',
  'sync work claims an exact connection'
);
select is(
  (
    select status from public.youtube_connections
    where user_id = '60000000-0000-4000-8000-000000000001'
      and google_subject = 'google-subject-b'
  ),
  'CONNECTED',
  'claiming connection A does not change connection B'
);
select is(
  public.claim_youtube_sync(
    (
      select id from public.youtube_connections
      where user_id = '60000000-0000-4000-8000-000000000001'
        and google_subject = 'google-subject-a'
    ),
    '60000000-0000-4000-8000-000000000002',
    false
  ),
  'YOUTUBE_NOT_CONNECTED',
  'sync claims reject a mismatched connection owner'
);

select public.finish_youtube_sync(
  (
    select id from public.youtube_connections
    where user_id = '60000000-0000-4000-8000-000000000001'
      and google_subject = 'google-subject-a'
  ),
  '60000000-0000-4000-8000-000000000001',
  null
);
select is(
  (
    select status from public.youtube_connections
    where user_id = '60000000-0000-4000-8000-000000000001'
      and google_subject = 'google-subject-a'
  ),
  'CONNECTED',
  'finishing connection A restores only connection A'
);

update public.youtube_connections
set last_authorization_verified_at = null,
    last_verification_attempt_at = null
where user_id = '60000000-0000-4000-8000-000000000001'
  and google_subject = 'google-subject-b';

create temporary table multi_compliance_claim on commit drop as
select *
from public.claim_due_compliance_connections(
  10,
  '61000000-0000-4000-8000-000000000001'
);
select is(
  (select count(*)::integer from multi_compliance_claim),
  1,
  'compliance claims only the independently due connection'
);
select is(
  (select connection_id from multi_compliance_claim),
  (
    select id from public.youtube_connections
    where user_id = '60000000-0000-4000-8000-000000000001'
      and google_subject = 'google-subject-b'
  ),
  'compliance claims expose the exact connection identifier'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select count(*)::integer from public.youtube_connections),
  2,
  'RLS exposes only the authenticated user connections'
);
select is(
  (select count(*)::integer from public.channels),
  2,
  'RLS exposes only the authenticated user channels'
);
select ok(
  not has_table_privilege('authenticated', 'public.youtube_token_vault', 'SELECT'),
  'authenticated clients cannot read Vault mappings'
);
reset role;

insert into public.data_deletion_requests (
  id,
  user_id,
  connection_id,
  type,
  status,
  requested_at
)
values
  (
    '62000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    (
      select id from public.youtube_connections
      where user_id = '60000000-0000-4000-8000-000000000001'
        and google_subject = 'google-subject-a'
    ),
    'YOUTUBE_DISCONNECT',
    'PENDING',
    now() - interval '2 minutes'
  ),
  (
    '62000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000002',
    null,
    'ACCOUNT_DELETE',
    'PENDING',
    now() - interval '1 minute'
  );

create temporary table multi_deletion_claim on commit drop as
select *
from public.claim_deletion_requests(
  2,
  '63000000-0000-4000-8000-000000000001'
);
select is(
  (
    select connection_id from multi_deletion_claim
    where id = '62000000-0000-4000-8000-000000000001'
  ),
  (
    select id from public.youtube_connections
    where user_id = '60000000-0000-4000-8000-000000000001'
      and google_subject = 'google-subject-a'
  ),
  'a YouTube disconnect claim remains connection scoped'
);
select is(
  (
    select connection_id from multi_deletion_claim
    where id = '62000000-0000-4000-8000-000000000002'
  ),
  null::uuid,
  'an account deletion claim remains global'
);

select * from finish();
rollback;
