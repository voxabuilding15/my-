begin;
\ir _helpers.psql
select plan(16);

select tests.create_user('user@example.com') as ada \gset

-- Versions compare numerically
select ok(private.version_parts('1.10.0') > private.version_parts('1.9.3'), '1.10.0 is newer than 1.9.3');
select ok(private.version_parts('2.0.0-beta.1') = array[2, 0, 0], 'pre-release suffixes are ignored');

-- Client configuration
insert into public.feature_flags (key, enabled, min_app_version) values ('ai.new_tool', true, '1.2.0');
insert into public.feature_flags (key, enabled, rollout_percent) values ('ai.half', true, 50);
insert into public.feature_flags (key, enabled, tiers) values ('ai.premium_only', true, array['premium']::public.plan_tier[]);
insert into public.feature_flags (key, enabled, platforms) values ('web.only', true, array['web']);
insert into public.announcements (title, body, audience, priority) values
  ('{"en": "Welcome", "ar": "أهلاً"}', '{"en": "Hi"}', 'all', 1),
  ('{"en": "Go Premium"}', '{"en": "…"}', 'free', 2),
  ('{"en": "Thanks"}', '{"en": "…"}', 'premium', 3),
  ('{"en": "Old"}', '{"en": "…"}', 'all', 9);
update public.announcements set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day'
where title ->> 'en' = 'Old';

set local role anon;
select public.get_client_config('android', '1.0.0') as anon_config \gset
reset role;
select ok((:'anon_config'::jsonb -> 'flags' ->> 'ai.chat')::boolean, 'anonymous clients receive enabled flags');
select is(:'anon_config'::jsonb -> 'flags' ->> 'ai.new_tool', 'false', 'flags respect the minimum app version');
select is(:'anon_config'::jsonb -> 'flags' ->> 'web.only', 'false', 'flags respect platforms');
select is(:'anon_config'::jsonb -> 'flags' ->> 'ai.half', 'false', 'partial rollouts never include anonymous clients');
select ok(:'anon_config'::jsonb -> 'config' ? 'ai.enabled', 'public config is included');
select ok(not (:'anon_config'::jsonb -> 'config' ? 'admin.require_mfa'), 'private config is never exposed');

set local role authenticated;
select tests.as_user(:'ada');
select public.get_client_config('android', '1.2.0') as ada_config \gset
select ok((:'ada_config'::jsonb -> 'flags' ->> 'ai.new_tool')::boolean, 'a new enough app gets the versioned flag');
select is(
  (select array_agg(a -> 'title' ->> 'en' order by ord) from jsonb_array_elements(:'ada_config'::jsonb -> 'announcements') with ordinality t(a, ord)),
  array['Go Premium', 'Welcome'],
  'free users get current announcements for their audience, highest priority first'
);
select is(:'ada_config'::jsonb -> 'flags' ->> 'ai.premium_only', 'false', 'tier-restricted flags are off for free users');
reset role;

-- Billing events (RevenueCat)
select is(public.apply_billing_event(jsonb_build_object(
  'id', 'evt_1', 'type', 'INITIAL_PURCHASE', 'app_user_id', :'ada', 'product_id', 'studexa_premium_yearly',
  'price', 29.99, 'event_timestamp_ms', 2000, 'expiration_at_ms', (extract(epoch from now() + interval '1 year') * 1000)::bigint,
  'store', 'PLAY_STORE')), 'processed', 'a purchase is processed');
select is(public.current_tier(:'ada')::text, 'premium', 'a purchase grants premium');
select is(public.apply_billing_event('{"id": "evt_1", "type": "INITIAL_PURCHASE"}'), 'duplicate', 'redelivered events are ignored');
select is(public.apply_billing_event(jsonb_build_object(
  'id', 'evt_0', 'type', 'EXPIRATION', 'app_user_id', :'ada', 'event_timestamp_ms', 1000)), 'stale',
  'an older event arriving late does not overwrite newer state');
select is(
  (select sum(value)::bigint from analytics.daily_metrics where metric = 'revenue_usd_micros'),
  29990000::bigint, 'revenue is aggregated anonymously'
);

select * from finish();
rollback;
