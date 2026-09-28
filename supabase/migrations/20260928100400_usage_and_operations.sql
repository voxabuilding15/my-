-- Quotas, usage metering, study activity & streaks, rate limiting, error and content reports,
-- push tokens, hybrid retrieval, GDPR export and data-retention maintenance.

------------------------------------------------------------------------------------------
-- Quotas
--
-- Counters are per user, metric and period (a day or a month in the user's timezone).
-- consume_quota() increments with a conditional UPDATE, so concurrent requests can never push
-- usage past the limit.
------------------------------------------------------------------------------------------

create table public.usage_counters (
  user_id uuid not null references public.profiles (id) on delete cascade,
  metric public.usage_metric not null,
  period_start date not null,
  used integer not null default 0 check (used >= 0),
  primary key (user_id, metric, period_start)
);

alter table public.usage_counters enable row level security;
create policy "Users read their own usage" on public.usage_counters
for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.usage_counters from anon, authenticated;
grant select on public.usage_counters to authenticated;

create function private.metric_limit(p_tier public.plan_tier, p_metric public.usage_metric)
returns integer
language sql stable set search_path = '' as $$
  select case p_metric
    when 'ai_requests' then l.ai_requests_per_day
    when 'uploads' then l.uploads_per_month
    when 'quizzes' then l.quizzes_per_day
    when 'flashcard_decks' then l.flashcard_decks_per_day
    when 'ocr_scans' then l.ocr_scans_per_day
    when 'chat_messages' then l.chat_messages_per_day
  end
  from public.plan_limits l where l.tier = p_tier;
$$;

create function private.metric_period_start(p_user_id uuid, p_metric public.usage_metric)
returns date
language sql stable set search_path = '' as $$
  select case when p_metric = 'uploads'
    then date_trunc('month', now() at time zone p.timezone)::date
    else (now() at time zone p.timezone)::date
  end
  from public.profiles p where p.id = p_user_id;
$$;

create function public.consume_quota(p_user_id uuid, p_metric public.usage_metric, p_quantity integer default 1)
returns table (allowed boolean, used integer, quota integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer := private.metric_limit(public.current_tier(p_user_id), p_metric);
  v_period date := private.metric_period_start(p_user_id, p_metric);
  v_used integer;
begin
  if p_quantity <= 0 then
    raise exception 'quantity must be positive' using errcode = 'invalid_parameter_value';
  end if;
  if v_period is null then
    raise exception 'unknown user' using errcode = 'no_data_found';
  end if;

  insert into public.usage_counters (user_id, metric, period_start)
  values (p_user_id, p_metric, v_period)
  on conflict do nothing;

  update public.usage_counters c set used = c.used + p_quantity
  where c.user_id = p_user_id and c.metric = p_metric and c.period_start = v_period
    and (v_limit is null or c.used + p_quantity <= v_limit)
  returning c.used into v_used;

  if found then
    return query select true, v_used, v_limit;
  else
    return query
    select false, c.used, v_limit from public.usage_counters c
    where c.user_id = p_user_id and c.metric = p_metric and c.period_start = v_period;
  end if;
end;
$$;

-- Gives quota back when the work it was reserved for failed (e.g. the model call errored).
create function public.release_quota(p_user_id uuid, p_metric public.usage_metric, p_quantity integer default 1)
returns void
language sql security definer set search_path = '' as $$
  update public.usage_counters set used = greatest(0, used - p_quantity)
  where user_id = p_user_id and metric = p_metric
    and period_start = private.metric_period_start(p_user_id, p_metric);
$$;

-- Validates an upload against the plan (file size, total storage, monthly uploads) and
-- reserves the upload quota when allowed.
create function public.authorize_upload(p_user_id uuid, p_size_bytes bigint)
returns table (allowed boolean, reason text)
language plpgsql security definer set search_path = '' as $$
declare
  v_limits public.plan_limits%rowtype;
  v_stored bigint;
begin
  select * into v_limits from public.plan_limits where tier = public.current_tier(p_user_id);

  if p_size_bytes > v_limits.max_file_size_mb::bigint * 1048576 then
    return query select false, 'file_too_large';
    return;
  end if;

  if v_limits.storage_mb is not null then
    select coalesce(sum(size_bytes), 0) into v_stored from public.documents where user_id = p_user_id;
    if v_stored + p_size_bytes > v_limits.storage_mb::bigint * 1048576 then
      return query select false, 'storage_full';
      return;
    end if;
  end if;

  if not (select q.allowed from public.consume_quota(p_user_id, 'uploads') q) then
    return query select false, 'quota_exceeded';
    return;
  end if;

  return query select true, null::text;
end;
$$;

grant execute on function public.consume_quota(uuid, public.usage_metric, integer) to service_role;
grant execute on function public.release_quota(uuid, public.usage_metric, integer) to service_role;
grant execute on function public.authorize_upload(uuid, bigint) to service_role;

-- What the app shows on usage meters and the paywall.
create function public.get_my_usage()
returns table (metric text, used bigint, quota bigint, period_start date)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  tier as (select public.current_tier(me.id) as t from me)
  select m::text,
    coalesce(c.used, 0)::bigint,
    private.metric_limit((select t from tier), m)::bigint,
    private.metric_period_start(me.id, m)
  from me
  cross join unnest(enum_range(null::public.usage_metric)) m
  left join public.usage_counters c
    on c.user_id = me.id and c.metric = m and c.period_start = private.metric_period_start(me.id, m)
  where me.id is not null
  union all
  select 'storage_mb',
    ceil(coalesce((select sum(size_bytes) from public.documents d where d.user_id = me.id), 0) / 1048576.0)::bigint,
    (select storage_mb from public.plan_limits where tier = (select t from tier))::bigint,
    null
  from me
  where me.id is not null;
$$;
grant execute on function public.get_my_usage() to authenticated;

------------------------------------------------------------------------------------------
-- Usage events (AI cost & token accounting; raw rows kept for app_config.retention days)
------------------------------------------------------------------------------------------

create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  tier public.plan_tier not null,
  action public.ai_action not null,
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  latency_ms integer check (latency_ms >= 0),
  succeeded boolean not null default true,
  created_at timestamptz not null default now()
);
create index usage_events_user_recent_idx on public.usage_events (user_id, created_at desc);
create index usage_events_created_at_idx on public.usage_events using brin (created_at);

alter table public.usage_events enable row level security;
create policy "Users and admins read usage events" on public.usage_events
for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
revoke all on public.usage_events from anon, authenticated;
grant select on public.usage_events to authenticated;

-- Aggregates are written at insert time so statistics stay complete after a user (and with
-- them their raw events) is deleted.
create function private.aggregate_usage_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.bump_metric('ai_requests', new.action::text);
  perform private.bump_metric('ai_requests_by_tier', new.tier::text);
  if not new.succeeded then
    perform private.bump_metric('ai_failures', new.action::text);
  end if;
  if new.model is not null then
    perform private.bump_metric('ai_input_tokens', new.model, new.input_tokens);
    perform private.bump_metric('ai_output_tokens', new.model, new.output_tokens);
    perform private.bump_metric('ai_cached_input_tokens', new.model, new.cached_input_tokens);
    perform private.bump_metric('ai_cost_micros', new.model, new.cost_micros);
  end if;
  perform private.record_activity(new.user_id, 'ai_request');
  return new;
end;
$$;

create trigger usage_events_aggregate after insert on public.usage_events
for each row execute function private.aggregate_usage_event();

-- Today's estimated AI spend, checked against app_config 'ai.daily_budget_usd'.
create function public.ai_spend_today_usd() returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(value), 0) / 1000000.0
  from analytics.daily_metrics
  where day = (now() at time zone 'utc')::date and metric = 'ai_cost_micros';
$$;
grant execute on function public.ai_spend_today_usd() to service_role;

------------------------------------------------------------------------------------------
-- Study activity, streaks and statistics
------------------------------------------------------------------------------------------

create table public.study_activity_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_date date not null,
  study_seconds integer not null default 0 check (study_seconds between 0 and 86400),
  ai_requests integer not null default 0,
  messages_sent integer not null default 0,
  cards_reviewed integer not null default 0,
  quizzes_completed integer not null default 0,
  primary key (user_id, activity_date)
);

alter table public.study_activity_days enable row level security;
create policy "Users read their own activity" on public.study_activity_days
for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.study_activity_days from anon, authenticated;
grant select on public.study_activity_days to authenticated;

create function private.record_activity(p_user_id uuid, p_kind text, p_amount integer default 1)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_today date;
  v_first_today boolean;
begin
  select (now() at time zone timezone)::date into v_today from public.profiles where id = p_user_id;
  if v_today is null then
    return;
  end if;

  insert into public.study_activity_days as a (
    user_id, activity_date, study_seconds, ai_requests, messages_sent, cards_reviewed, quizzes_completed
  ) values (
    p_user_id, v_today,
    case when p_kind = 'study_time' then least(p_amount, 86400) else 0 end,
    case when p_kind = 'ai_request' then p_amount else 0 end,
    case when p_kind = 'message_sent' then p_amount else 0 end,
    case when p_kind = 'card_reviewed' then p_amount else 0 end,
    case when p_kind = 'quiz_completed' then p_amount else 0 end
  )
  on conflict (user_id, activity_date) do update set
    study_seconds = least(86400, a.study_seconds + excluded.study_seconds),
    ai_requests = a.ai_requests + excluded.ai_requests,
    messages_sent = a.messages_sent + excluded.messages_sent,
    cards_reviewed = a.cards_reviewed + excluded.cards_reviewed,
    quizzes_completed = a.quizzes_completed + excluded.quizzes_completed
  returning (xmax = 0) into v_first_today;

  if v_first_today then
    perform private.bump_metric('active_users');
  end if;
end;
$$;

create function private.record_message_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'user' then
    perform private.record_activity(new.user_id, 'message_sent');
  end if;
  return new;
end;
$$;

create trigger messages_record_activity after insert on public.messages
for each row execute function private.record_message_activity();

-- Reading/study time reported by the app (at most one hour per call).
create function public.log_study_time(p_seconds integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  perform private.record_activity((select auth.uid()), 'study_time', greatest(0, least(p_seconds, 3600)));
end;
$$;
grant execute on function public.log_study_time(integer) to authenticated;

create function public.get_study_stats()
returns table (
  current_streak integer,
  longest_streak integer,
  active_days integer,
  study_seconds_7d bigint,
  cards_reviewed_7d bigint,
  quizzes_completed_7d bigint,
  cards_due bigint
)
language sql stable security definer set search_path = '' as $$
  with me as (
    select p.id, (now() at time zone p.timezone)::date as today
    from public.profiles p where p.id = (select auth.uid())
  ),
  days as (
    select a.* from public.study_activity_days a join me on a.user_id = me.id
  ),
  runs as (
    select max(activity_date) as last_day, count(*)::integer as length
    from (select activity_date, activity_date - (row_number() over (order by activity_date))::integer as grp from days) s
    group by grp
  )
  select
    coalesce((select max(length) from runs where last_day >= me.today - 1), 0),
    coalesce((select max(length) from runs), 0),
    (select count(*)::integer from days),
    coalesce((select sum(study_seconds) from days where activity_date > me.today - 7), 0),
    coalesce((select sum(cards_reviewed) from days where activity_date > me.today - 7), 0),
    coalesce((select sum(quizzes_completed) from days where activity_date > me.today - 7), 0),
    (select count(*) from public.flashcards f where f.user_id = me.id and f.due_at <= now())
  from me;
$$;
grant execute on function public.get_study_stats() to authenticated;

------------------------------------------------------------------------------------------
-- Rate limiting for Edge Functions (fixed window; unlogged = fast, loss on crash is harmless)
------------------------------------------------------------------------------------------

create unlogged table private.rate_limit_windows (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- Keys are "<purpose>:<user id>" (or ":<ip>"); a deleted user's windows are removed with them.
create function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into private.rate_limit_windows as w (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = w.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

create function private.forget_rate_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.rate_limit_windows where key like '%:' || old.id::text;
  return old;
end;
$$;

create trigger profiles_forget_rate_limits after delete on public.profiles
for each row execute function private.forget_rate_limits();

------------------------------------------------------------------------------------------
-- Error logs (admin "Errors" screen). Kept for app_config.retention.error_logs_days.
------------------------------------------------------------------------------------------

create table public.error_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  source public.error_source not null default 'mobile',
  severity public.error_severity not null default 'error',
  code text check (char_length(code) <= 100),
  message text not null check (char_length(message) <= 2000),
  context jsonb not null default '{}' check (pg_column_size(context) <= 16384),
  app_version text check (char_length(app_version) <= 32),
  platform text check (char_length(platform) <= 32),
  created_at timestamptz not null default now()
);
create index error_logs_user_id_idx on public.error_logs (user_id);
create index error_logs_created_at_idx on public.error_logs using brin (created_at);
create index error_logs_code_recent_idx on public.error_logs (code, created_at desc);

create function private.throttle_client_errors() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Drop (rather than fail) reports beyond 60 per user per hour so logging can't be abused.
  if new.user_id is not null and not public.check_rate_limit('errors:' || new.user_id, 60, 3600) then
    return null;
  end if;
  return new;
end;
$$;

create trigger error_logs_throttle before insert on public.error_logs
for each row execute function private.throttle_client_errors();

alter table public.error_logs enable row level security;
create policy "Users report their own errors" on public.error_logs
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Admins read errors" on public.error_logs
for select to authenticated using ((select public.is_admin()));
revoke all on public.error_logs from anon, authenticated;
grant insert (user_id, severity, code, message, context, app_version, platform) on public.error_logs to authenticated;
grant select on public.error_logs to authenticated;

------------------------------------------------------------------------------------------
-- Content reports ("this answer is wrong/harmful") for the admin "Reports" screen
------------------------------------------------------------------------------------------

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target not null,
  target_id uuid,
  reason public.report_reason not null,
  details text check (char_length(details) <= 2000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);
create index content_reports_reporter_id_idx on public.content_reports (reporter_id);
create index content_reports_resolved_by_idx on public.content_reports (resolved_by);
create index content_reports_status_recent_idx on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;
create policy "Users file reports" on public.content_reports
for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "Users read their reports, admins read all" on public.content_reports
for select to authenticated using (reporter_id = (select auth.uid()) or (select public.is_admin()));
create policy "Admins triage reports" on public.content_reports
for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.content_reports from anon, authenticated;
grant select on public.content_reports to authenticated;
grant insert (reporter_id, target_type, target_id, reason, details) on public.content_reports to authenticated;
grant update (status, resolved_at, resolved_by) on public.content_reports to authenticated;

------------------------------------------------------------------------------------------
-- Push tokens (server-sent study reminders)
------------------------------------------------------------------------------------------

create table public.push_tokens (
  token text primary key check (char_length(token) <= 512),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
create policy "Users read their own push tokens" on public.push_tokens
for select to authenticated using (user_id = (select auth.uid()));
create policy "Users remove their own push tokens" on public.push_tokens
for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_tokens from anon, authenticated;
grant select, delete on public.push_tokens to authenticated;

-- A device token moves with whoever is signed in on the device.
create function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, (select auth.uid()), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end;
$$;
grant execute on function public.register_push_token(text, text) to authenticated;

------------------------------------------------------------------------------------------
-- Hybrid retrieval: full-text search + vector similarity fused with Reciprocal Rank Fusion.
-- SECURITY INVOKER so RLS limits results to the caller's own chunks. Without a query
-- embedding (e.g. embeddings provider unavailable) it degrades to full-text search alone.
------------------------------------------------------------------------------------------

create function public.match_document_chunks(
  p_document_ids uuid[],
  p_query text,
  p_query_embedding extensions.vector default null,
  p_match_count integer default 8,
  p_rrf_k integer default 60
)
returns table (
  chunk_id uuid,
  document_id uuid,
  page_start integer,
  page_end integer,
  content text,
  score double precision
)
language sql stable security invoker set search_path = '' as $$
  with active_model as (
    select id from public.embedding_models where is_active
  ),
  full_text as (
    select c.id, row_number() over (
      order by ts_rank_cd(c.search, websearch_to_tsquery(c.ts_config, p_query)) desc
    ) as rank
    from public.document_chunks c
    where c.document_id = any (p_document_ids)
      and c.search @@ websearch_to_tsquery(c.ts_config, p_query)
    order by rank
    limit least(p_match_count, 50) * 2
  ),
  semantic as (
    select e.chunk_id as id, row_number() over (
      order by e.embedding operator(extensions.<=>) p_query_embedding
    ) as rank
    from public.document_chunk_embeddings e
    where p_query_embedding is not null
      and e.document_id = any (p_document_ids)
      and e.model_id = (select id from active_model)
    order by rank
    limit least(p_match_count, 50) * 2
  ),
  fused as (
    select coalesce(f.id, s.id) as id,
      coalesce(1.0 / (p_rrf_k + f.rank), 0.0) + coalesce(1.0 / (p_rrf_k + s.rank), 0.0) as score
    from full_text f
    full outer join semantic s on f.id = s.id
  )
  select c.id, c.document_id, c.page_start, c.page_end, c.content, fused.score
  from fused
  join public.document_chunks c on c.id = fused.id
  order by fused.score desc, c.chunk_index
  limit least(p_match_count, 50);
$$;
grant execute on function public.match_document_chunks(uuid[], text, extensions.vector, integer, integer)
  to authenticated, service_role;

------------------------------------------------------------------------------------------
-- GDPR: data export (Art. 15 & 20). Files are delivered separately as signed URLs.
------------------------------------------------------------------------------------------

create function public.export_my_data() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where id = v_user),
    'settings', (select to_jsonb(s) - 'user_id' from public.user_settings s where user_id = v_user),
    'subscription', (select to_jsonb(s) - 'user_id' from public.subscriptions s where user_id = v_user),
    'documents', coalesce((select jsonb_agg(to_jsonb(d) - 'user_id' - 'ts_config') from public.documents d where user_id = v_user), '[]'),
    'document_pages', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.document_pages x where user_id = v_user), '[]'),
    'bookmarks', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.bookmarks x where user_id = v_user), '[]'),
    'conversations', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.conversations x where user_id = v_user), '[]'),
    'messages', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id' - 'search') from public.messages x where user_id = v_user), '[]'),
    'ai_outputs', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.ai_outputs x where user_id = v_user), '[]'),
    'notes', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id' - 'search') from public.notes x where user_id = v_user), '[]'),
    'quizzes', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.quizzes x where user_id = v_user), '[]'),
    'quiz_questions', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.quiz_questions x where user_id = v_user), '[]'),
    'quiz_attempts', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.quiz_attempts x where user_id = v_user), '[]'),
    'quiz_answers', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.quiz_answers x where user_id = v_user), '[]'),
    'flashcard_decks', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.flashcard_decks x where user_id = v_user), '[]'),
    'flashcards', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.flashcards x where user_id = v_user), '[]'),
    'flashcard_reviews', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.flashcard_reviews x where user_id = v_user), '[]'),
    'study_activity', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.study_activity_days x where user_id = v_user), '[]'),
    'usage_events', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.usage_events x where user_id = v_user), '[]'),
    'content_reports', coalesce((select jsonb_agg(to_jsonb(x) - 'reporter_id') from public.content_reports x where reporter_id = v_user), '[]'),
    'push_tokens', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id') from public.push_tokens x where user_id = v_user), '[]')
  );
end;
$$;
grant execute on function public.export_my_data() to authenticated;

------------------------------------------------------------------------------------------
-- Data-retention maintenance (GDPR data minimisation), scheduled daily with pg_cron
------------------------------------------------------------------------------------------

create function private.run_maintenance() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_retention jsonb := (select value from public.app_config where key = 'retention');
begin
  delete from public.usage_events
  where created_at < now() - make_interval(days => (v_retention ->> 'usage_events_days')::integer);
  delete from public.error_logs
  where created_at < now() - make_interval(days => (v_retention ->> 'error_logs_days')::integer);
  delete from public.billing_events
  where processed_at is not null
    and received_at < now() - make_interval(days => (v_retention ->> 'billing_events_days')::integer);
  delete from public.usage_counters where period_start < current_date - 62;
  delete from private.rate_limit_windows where window_start < now() - interval '1 day';
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('studexa-maintenance', '17 3 * * *', 'select private.run_maintenance()');
  else
    raise notice 'pg_cron not available; schedule private.run_maintenance() externally';
  end if;
end;
$$;
