begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '70000000-0000-4000-8000-000000000001',
    'profile-1@example.test',
    '{"full_name":"Profile One"}'
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    'profile-2@example.test',
    '{}'
  );

select is(
  (
    select count(*)::integer
    from public.profiles
    where user_id in (
      '70000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000002'
    )
  ),
  2,
  'new Auth users receive profiles even without a YouTube connection'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where user_id in (
      '70000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000002'
    )
      and display_name is null
  ),
  2,
  'new profiles keep display_name null until the user explicitly saves it'
);
select col_is_null(
  'public',
  'profiles',
  'display_name',
  'profiles.display_name remains nullable'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'),
  'authenticated users may update the display-name column'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);
select is(
  (select count(*)::integer from public.profiles),
  1,
  'RLS exposes the profile without requiring dashboard or channel data'
);
select lives_ok(
  $$
    update public.profiles
    set display_name = 'Mahmoud'
    where user_id = '70000000-0000-4000-8000-000000000001'
  $$,
  'the authenticated user may issue an own-profile update'
);
select is(
  (
    select display_name
    from public.profiles
    where user_id = '70000000-0000-4000-8000-000000000001'
  ),
  'Mahmoud',
  'the authenticated user can update their own display name'
);
select lives_ok(
  $$
    update public.profiles
    set display_name = 'Not allowed'
    where user_id = '70000000-0000-4000-8000-000000000002'
  $$,
  'an update targeting another profile reveals no row and raises no oracle error'
);
reset role;

select is(
  (
    select display_name
    from public.profiles
    where user_id = '70000000-0000-4000-8000-000000000002'
  ),
  null::text,
  'the other user profile remains unchanged'
);
select throws_like(
  $$
    update public.profiles
    set display_name = ' leading'
    where user_id = '70000000-0000-4000-8000-000000000001'
  $$,
  '%profiles_display_name_check%',
  'leading whitespace is rejected'
);
select throws_like(
  $$
    update public.profiles
    set display_name = 'trailing '
    where user_id = '70000000-0000-4000-8000-000000000001'
  $$,
  '%profiles_display_name_check%',
  'trailing whitespace is rejected'
);
select throws_like(
  $$
    update public.profiles
    set display_name = ''
    where user_id = '70000000-0000-4000-8000-000000000001'
  $$,
  '%profiles_display_name_check%',
  'an empty display name is rejected'
);
select throws_like(
  $$
    update public.profiles
    set display_name = repeat('x', 81)
    where user_id = '70000000-0000-4000-8000-000000000001'
  $$,
  '%profiles_display_name_check%',
  'display names longer than 80 characters are rejected'
);
select lives_ok(
  $$
    update public.profiles
    set display_name = repeat('x', 80)
    where user_id = '70000000-0000-4000-8000-000000000001'
  $$,
  'an 80-character display name is accepted'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '70000000-0000-4000-8000-000000000001',
  true
);
select is(
  (
    select display_name
    from public.profiles
    where user_id = '70000000-0000-4000-8000-000000000001'
  ),
  repeat('x', 80),
  'the saved display name persists across a signed-out and signed-in role cycle'
);
reset role;

select * from finish();
rollback;
