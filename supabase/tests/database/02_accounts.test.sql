begin;
\ir _helpers.psql
select plan(15);

select tests.create_user('ada@example.com', '{"full_name": "Ada Lovelace"}') as ada \gset
select tests.create_user('bob@example.com') as bob \gset
select tests.create_user('root@example.com') as admin \gset
select tests.make_admin(:'admin');

-- Sign-up hook
select is((select display_name from public.profiles where id = :'ada'), 'Ada Lovelace', 'profile takes the name from sign-up metadata');
select ok(exists (select 1 from public.user_settings where user_id = :'ada'), 'settings row is created on sign-up');
select is((select tier::text from public.subscriptions where user_id = :'ada'), 'free', 'new users start on the free tier');
select ok((select sum(value) >= 3 from analytics.daily_metrics where metric = 'signups'), 'sign-ups are counted anonymously');

-- Profile isolation and privilege escalation
set local role authenticated;
select tests.as_user(:'ada');

select is((select count(*)::int from public.profiles), 1, 'a user sees only their own profile');
select throws_ok(
  format('update public.profiles set role = %L where id = %L', 'admin', :'ada'),
  '42501', null, 'a user cannot make themselves admin'
);
select lives_ok(
  format('update public.profiles set display_name = %L, timezone = %L where id = %L', 'Ada L.', 'Africa/Casablanca', :'ada'),
  'a user can edit their own profile'
);
select throws_ok(
  format('update public.profiles set timezone = %L where id = %L', 'Mars/Olympus', :'ada'),
  '23514', null, 'an invalid timezone is rejected'
);

-- Plan limits: readable by all, editable by admins only
select is((select count(*)::int from public.plan_limits), 2, 'users can read plan limits');
update public.plan_limits set ai_requests_per_day = 9999 where tier = 'free';
select is((select ai_requests_per_day from public.plan_limits where tier = 'free'), 20, 'a regular user cannot change plan limits');

select tests.as_user(:'admin');
update public.plan_limits set ai_requests_per_day = 25 where tier = 'free';
select is((select ai_requests_per_day from public.plan_limits where tier = 'free'), 25, 'an admin can change plan limits');
select is((select count(*)::int from public.profiles), 3, 'an admin can read all profiles');

reset role;
select tests.clear_user();
select results_eq(
  'select admin_id, target, (before ->> ''ai_requests_per_day'')::int, (after ->> ''ai_requests_per_day'')::int from public.admin_audit_log',
  format('values (%L::uuid, %L::text, 20, 25)', :'admin', 'plan_limits'),
  'limit changes are written to the audit log with the acting admin'
);

-- Effective tier
update public.subscriptions set tier = 'premium', status = 'active', current_period_end = now() + interval '30 days'
where user_id = :'bob';
select is(public.current_tier(:'bob')::text, 'premium', 'an active premium subscription grants premium');
update public.subscriptions set current_period_end = now() - interval '1 minute' where user_id = :'bob';
select is(public.current_tier(:'bob')::text, 'free', 'an expired subscription falls back to free');

select * from finish();
rollback;
