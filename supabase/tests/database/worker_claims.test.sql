begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

select ok(
  not has_function_privilege(
    'anon',
    'public.claim_due_compliance_connections(integer, uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot claim compliance work'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_due_compliance_connections(integer, uuid)',
    'EXECUTE'
  ),
  'authenticated callers cannot claim compliance work'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_due_compliance_connections(integer, uuid)',
    'EXECUTE'
  ),
  'service role can claim compliance work'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.claim_deletion_requests(integer, uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot claim deletion work'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_deletion_requests(integer, uuid)',
    'EXECUTE'
  ),
  'authenticated callers cannot claim deletion work'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_deletion_requests(integer, uuid)',
    'EXECUTE'
  ),
  'service role can claim deletion work'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'claim-1@example.test', '{}'),
  ('10000000-0000-4000-8000-000000000002', 'claim-2@example.test', '{}'),
  ('10000000-0000-4000-8000-000000000003', 'claim-3@example.test', '{}'),
  ('10000000-0000-4000-8000-000000000004', 'claim-4@example.test', '{}');

insert into public.youtube_connections (
  user_id,
  status,
  last_authorization_verified_at,
  last_verification_attempt_at
)
values
  ('10000000-0000-4000-8000-000000000001', 'CONNECTED', null, null),
  (
    '10000000-0000-4000-8000-000000000002',
    'CONNECTED',
    now() - interval '31 days',
    null
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'CONNECTED',
    now() - interval '25 days',
    null
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'CONNECTED',
    now() - interval '24 days',
    null
  );

create temporary table compliance_claim_a on commit drop as
select *
from public.claim_due_compliance_connections(
  2,
  '20000000-0000-4000-8000-000000000001'
);

select is(
  (select count(*)::integer from compliance_claim_a),
  2,
  'first compliance batch claims its bounded size'
);
select results_eq(
  $$
    select user_id
    from compliance_claim_a
    order by last_authorization_verified_at asc nulls first, user_id
  $$,
  $$
    values
      ('10000000-0000-4000-8000-000000000001'::uuid),
      ('10000000-0000-4000-8000-000000000002'::uuid)
  $$,
  'unverified and oldest authorization rows are claimed first'
);

create temporary table compliance_claim_b on commit drop as
select *
from public.claim_due_compliance_connections(
  100,
  '20000000-0000-4000-8000-000000000002'
);

select is(
  (select count(*)::integer from compliance_claim_b),
  1,
  'a second worker skips active claims and still makes progress'
);
select results_eq(
  $$select user_id from compliance_claim_b$$,
  $$values ('10000000-0000-4000-8000-000000000003'::uuid)$$,
  'the second worker receives only the remaining due connection'
);
select is(
  (
    select verification_claim_id
    from public.youtube_connections
    where user_id = '10000000-0000-4000-8000-000000000004'
  ),
  null::uuid,
  'a 24-day authorization is not due'
);

update public.youtube_connections
set verification_claimed_at = now() - interval '11 minutes'
where user_id = '10000000-0000-4000-8000-000000000001';

create temporary table compliance_claim_c on commit drop as
select *
from public.claim_due_compliance_connections(
  1,
  '20000000-0000-4000-8000-000000000003'
);

select results_eq(
  $$select user_id from compliance_claim_c$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid)$$,
  'a stale compliance claim is recoverable'
);
select is(
  (
    select verification_claim_id
    from public.youtube_connections
    where user_id = '10000000-0000-4000-8000-000000000002'
  ),
  '20000000-0000-4000-8000-000000000001'::uuid,
  'an active compliance claim cannot be reclaimed'
);

insert into public.data_deletion_requests (
  id,
  user_id,
  type,
  status,
  requested_at,
  started_at,
  attempts,
  claim_id
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'YOUTUBE_DISCONNECT',
    'PENDING',
    now() - interval '3 days',
    null,
    0,
    null
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'ACCOUNT_DELETE',
    'RUNNING',
    now() - interval '4 days',
    now() - interval '5 minutes',
    2,
    '40000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    'COMPLIANCE_REVOKED',
    'RUNNING',
    now() - interval '2 days',
    now() - interval '16 minutes',
    4,
    '40000000-0000-4000-8000-000000000002'
  );

create temporary table deletion_claim_a on commit drop as
select *
from public.claim_deletion_requests(
  1,
  '50000000-0000-4000-8000-000000000001'
);

select results_eq(
  $$select id from deletion_claim_a$$,
  $$values ('30000000-0000-4000-8000-000000000001'::uuid)$$,
  'oldest eligible deletion is claimed first'
);
select is(
  (select attempts from deletion_claim_a),
  1,
  'deletion attempts increment exactly once when claimed'
);

create temporary table deletion_claim_b on commit drop as
select *
from public.claim_deletion_requests(
  25,
  '50000000-0000-4000-8000-000000000002'
);

select results_eq(
  $$select id from deletion_claim_b$$,
  $$values ('30000000-0000-4000-8000-000000000003'::uuid)$$,
  'only a stale RUNNING deletion is recovered by the next worker'
);
select is(
  (select attempts from deletion_claim_b),
  5,
  'stale deletion recovery increments attempts once'
);
select is(
  (
    select attempts
    from public.data_deletion_requests
    where id = '30000000-0000-4000-8000-000000000002'
  ),
  2,
  'an active RUNNING deletion remains untouched'
);
select is(
  (
    select claim_id
    from public.data_deletion_requests
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  '50000000-0000-4000-8000-000000000001'::uuid,
  'a second worker cannot double-claim the first deletion'
);

select * from finish();
rollback;
