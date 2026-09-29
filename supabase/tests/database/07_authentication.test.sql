begin;
\ir _helpers.psql
select plan(24);

select tests.create_user('new@example.com', '{}', false) as unverified \gset
select tests.create_user('ada@example.com') as ada \gset

-- Verification gate
select results_eq(
  format($$select allowed, reason from public.consume_quota(%L, 'ai_requests')$$, :'unverified'),
  $$values (false, 'email_unverified')$$,
  'unverified users cannot consume AI quota'
);
select is(
  (select used from public.usage_counters where user_id = :'unverified'), null,
  'a refused unverified request records no usage'
);
select results_eq(
  format($$select allowed, reason from public.authorize_upload(%L, 1000)$$, :'unverified'),
  $$values (false, 'email_unverified')$$,
  'unverified users cannot upload'
);
select results_eq(
  format($$select allowed, reason from public.consume_quota(%L, 'ai_requests')$$, :'ada'),
  $$values (true, null::text)$$,
  'verified users can use AI'
);
select ok(
  not private.is_email_verified(:'unverified')
    and (select email_confirmed_at is not null from auth.users where id = :'unverified'),
  'GoTrue auto-confirmation at signup does not count as verification'
);
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"provider": "google", "providers": ["google"]}'
where email = 'new@example.com';
select ok(private.is_email_verified(:'unverified'), 'Google accounts count as verified');
update auth.users set raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'
where email = 'new@example.com';
select ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'email_verified_from_meta'
      and has_function_privilege('authenticated', p.oid, 'execute')),
  'the verification helper is not callable by users'
);

-- Issuing codes
select results_eq(
  format($$select issued from public.issue_email_code(%L, 'reset_password', 'hash-1')$$, :'ada'),
  $$values (true)$$, 'a code is issued'
);
select results_eq(
  format($$select issued, retry_after_seconds between 55 and 60 from public.issue_email_code(%L, 'reset_password', 'hash-2')$$, :'ada'),
  $$values (false, true)$$, 'a new code cannot be requested within 60 seconds'
);

-- Pretend a minute passed; the new code replaces the old one.
update private.email_codes set created_at = now() - interval '61 seconds' where user_id = :'ada';
select results_eq(
  format($$select issued from public.issue_email_code(%L, 'reset_password', 'hash-2')$$, :'ada'),
  $$values (true)$$, 'a code can be re-sent after 60 seconds'
);
select results_eq(
  format($$select status from public.verify_email_code(%L, 'reset_password', 'hash-1', false)$$, :'ada'),
  $$values ('invalid')$$, 'issuing a new code invalidates the previous one'
);
select results_eq(
  format($$select status, attempts_remaining from public.verify_email_code(%L, 'reset_password', 'hash-2', false)$$, :'ada'),
  $$values ('valid', 4)$$, 'the current code is valid and a check does not consume it'
);
select results_eq(
  format($$select status from public.verify_email_code(%L, 'reset_password', 'hash-2', true)$$, :'ada'),
  $$values ('valid')$$, 'the code can be consumed'
);
select results_eq(
  format($$select status from public.verify_email_code(%L, 'reset_password', 'hash-2', true)$$, :'ada'),
  $$values ('no_code')$$, 'a consumed code cannot be reused'
);

-- Attempt limit
update private.email_codes set created_at = now() - interval '2 minutes' where user_id = :'ada';
select public.issue_email_code(:'ada', 'verify_email', 'good');
select results_eq(
  format($$select status, attempts_remaining from public.verify_email_code(%L, 'verify_email', 'bad', false)$$, :'ada'),
  $$values ('invalid', 4)$$, 'a wrong code reports the remaining attempts'
);
select public.verify_email_code(:'ada', 'verify_email', 'bad' || g, false) from generate_series(1, 3) g;
select results_eq(
  format($$select status from public.verify_email_code(%L, 'verify_email', 'bad', false)$$, :'ada'),
  $$values ('too_many_attempts')$$, 'the fifth wrong attempt locks the code'
);
select results_eq(
  format($$select status from public.verify_email_code(%L, 'verify_email', 'good', true)$$, :'ada'),
  $$values ('no_code')$$, 'a locked code is gone, even with the right value'
);

-- Expiry
update private.email_codes set created_at = now() - interval '2 minutes' where user_id = :'ada';
select public.issue_email_code(:'ada', 'verify_email', 'late');
update private.email_codes set expires_at = now() - interval '1 second' where user_id = :'ada' and purpose = 'verify_email';
select results_eq(
  format($$select status from public.verify_email_code(%L, 'verify_email', 'late', true)$$, :'ada'),
  $$values ('expired')$$, 'an expired code is rejected'
);

-- Lookups and sessions
select results_eq(
  $$select email_verified, has_password from public.find_auth_user_by_email('  ADA@example.com ')$$,
  $$values (true, true)$$, 'users are found by email case-insensitively'
);
insert into auth.sessions (id, user_id) values (gen_random_uuid(), :'ada'), (gen_random_uuid(), :'ada');
select public.revoke_user_sessions(:'ada');
select is((select count(*)::int from auth.sessions where user_id = :'ada'), 0, 'all sessions can be revoked');

-- Public config is readable before sign-in, private config is not
set local role anon;
select is(
  (select value ->> 'privacy_url' from public.app_config where key = 'legal'),
  'https://voxabuilding15.github.io/my-/privacy/', 'legal links are readable without an account'
);
select is((select count(*)::int from public.app_config where not is_public), 0, 'private config is hidden from anonymous users');
reset role;

-- Maintenance removes stale unverified email accounts only
select tests.create_user('stale@example.com', '{}', false) as stale \gset
update auth.users set created_at = now() - interval '8 days' where id in (:'stale', :'ada');
insert into auth.users (id, email, raw_app_meta_data, created_at)
values (gen_random_uuid(), 'oauth@example.com', '{"provider": "google", "providers": ["google"]}', now() - interval '30 days');
select private.run_maintenance();
select ok(not exists (select 1 from auth.users where id = :'stale'), 'stale unverified email accounts are removed');
select ok(
  exists (select 1 from auth.users where id = :'ada') and exists (select 1 from auth.users where email = 'oauth@example.com'),
  'verified and OAuth accounts are kept'
);

select * from finish();
rollback;
