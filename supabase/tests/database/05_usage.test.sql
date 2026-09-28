begin;
\ir _helpers.psql
select plan(19);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('pro@example.com') as pro \gset
update public.subscriptions set tier = 'premium', status = 'active', current_period_end = now() + interval '30 days'
where user_id = :'pro';

-- Quotas (free: 20 AI requests/day)
select is(
  (select count(*)::int from generate_series(1, 25) g, lateral public.consume_quota(:'ada', 'ai_requests', 1 + 0 * g) q where q.allowed),
  20, 'a free user gets exactly their daily AI allowance'
);
select results_eq(
  format($$select allowed, used, quota from public.consume_quota(%L, 'ai_requests')$$, :'ada'),
  $$values (false, 20, 20)$$,
  'requests beyond the limit are refused with the current usage'
);
select public.release_quota(:'ada', 'ai_requests');
select is(
  (select allowed from public.consume_quota(:'ada', 'ai_requests')),
  true, 'released quota (failed request) can be used again'
);
select is(
  (select count(*)::int from generate_series(1, 200) g, lateral public.consume_quota(:'pro', 'ai_requests', 1 + 0 * g) q where q.allowed),
  200, 'premium AI requests are unlimited'
);

update public.plan_limits set quizzes_per_day = 1 where tier = 'free';
select results_eq(
  format($$select allowed from public.consume_quota(%L, 'quizzes') union all select allowed from public.consume_quota(%L, 'quizzes')$$, :'ada', :'ada'),
  $$values (true), (false)$$,
  'limit changes from the admin dashboard apply immediately'
);

-- Uploads (free: 10 MB per file, 100 MB storage, 5 per month)
select results_eq(
  format($$select allowed, reason from public.authorize_upload(%L, 11 * 1048576)$$, :'ada'),
  $$values (false, 'file_too_large')$$, 'oversized files are refused'
);
select tests.create_document(:'ada', 'Big', 99 * 1048576);
select results_eq(
  format($$select allowed, reason from public.authorize_upload(%L, 2 * 1048576)$$, :'ada'),
  $$values (false, 'storage_full')$$, 'uploads beyond the storage allowance are refused'
);
select is(
  (select count(*)::int from generate_series(1, 6) g, lateral public.authorize_upload(:'pro', 1048576 + 0 * g) u where u.allowed),
  6, 'premium uploads are unlimited'
);

set local role authenticated;
select tests.as_user(:'ada');
select throws_ok(
  format($$select * from public.consume_quota(%L, 'ai_requests')$$, :'ada'),
  '42501', null, 'clients cannot consume or reset quota themselves'
);
select results_eq(
  $$select used, quota from public.get_my_usage() where metric in ('ai_requests', 'storage_mb') order by metric$$,
  $$values (20::bigint, 20::bigint), (99::bigint, 100::bigint)$$,
  'a user can see their usage meters'
);

-- Streaks
reset role;
insert into public.study_activity_days (user_id, activity_date)
select :'ada', current_date - d from unnest(array[0, 1, 2, 5, 6, 7, 8]) d
on conflict do nothing;
set local role authenticated;
select results_eq(
  $$select current_streak, longest_streak, active_days from public.get_study_stats()$$,
  $$values (3, 4, 7)$$,
  'current and longest streaks are computed from activity days'
);
select public.log_study_time(999999);
select is(
  (select study_seconds from public.study_activity_days where activity_date = current_date),
  3600, 'reported study time is capped per call'
);

-- Push tokens move with the signed-in user
select public.register_push_token('ExponentPushToken[abc]', 'android');
select tests.as_user(:'pro');
select public.register_push_token('ExponentPushToken[abc]', 'android');
reset role;
select is((select user_id from public.push_tokens where token = 'ExponentPushToken[abc]'), :'pro'::uuid, 'a device token belongs to the latest user');

-- Rate limiting
select is(
  (select count(*)::int from generate_series(1, 8) g where public.check_rate_limit('ai:' || :'ada', 5, 60)),
  5, 'the rate limiter allows exactly the configured number of hits per window'
);

-- Error logs are throttled per user
set local role authenticated;
select tests.as_user(:'ada');
insert into public.error_logs (user_id, message) select :'ada', 'boom ' || g from generate_series(1, 70) g;
reset role;
select is((select count(*)::int from public.error_logs where user_id = :'ada'), 60, 'error reports beyond 60 per hour are dropped');

-- Usage events feed anonymous aggregates
insert into public.usage_events (user_id, tier, action, model, input_tokens, output_tokens, cost_micros)
values (:'ada', 'free', 'summarize', 'model-x', 1000, 200, 4500);
select is(
  (select sum(value)::int from analytics.daily_metrics where metric = 'ai_cost_micros' and dimension = 'model-x'),
  4500, 'AI cost is aggregated per model'
);
select is(public.ai_spend_today_usd(), 0.0045, 'today''s AI spend is available for the budget kill switch');

-- Maintenance respects retention settings
insert into public.usage_events (user_id, tier, action, created_at) values (:'ada', 'free', 'explain', now() - interval '91 days');
select private.run_maintenance();
select is((select count(*)::int from public.usage_events where created_at < now() - interval '90 days'), 0, 'old usage events are purged');

select is(
  (select used from public.usage_counters where user_id = :'pro' and metric = 'ai_requests'),
  200, 'premium usage is still metered'
);

select * from finish();
rollback;
