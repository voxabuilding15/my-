-- Feature flags, announcements, client configuration, billing event processing, and the
-- admin dashboard API. Every admin function checks the staff role (with MFA) itself; the
-- dashboard never holds a service key.

------------------------------------------------------------------------------------------
-- Versions
------------------------------------------------------------------------------------------

create function private.version_parts(p_version text) returns integer[]
language sql immutable set search_path = '' as $$
  select coalesce(
    (select array_agg(coalesce(nullif(regexp_replace(part, '[^0-9].*$', ''), ''), '0')::integer order by ord)
     from unnest(string_to_array(split_part(coalesce(p_version, '0'), '-', 1), '.')) with ordinality as t(part, ord)),
    array[0]
  );
$$;

------------------------------------------------------------------------------------------
-- Feature flags
------------------------------------------------------------------------------------------

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]{1,63}$'),
  description text check (char_length(description) <= 500),
  enabled boolean not null default false,
  -- Deterministic per-user bucket: the same user stays in or out as the percentage grows.
  rollout_percent smallint not null default 100 check (rollout_percent between 0 and 100),
  platforms text[] not null default array['android', 'ios'] check (platforms <@ array['android', 'ios', 'web']),
  min_app_version text check (min_app_version ~ '^\d+(\.\d+){0,2}$'),
  tiers public.plan_tier[],
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create index feature_flags_updated_by_idx on public.feature_flags (updated_by);

create trigger feature_flags_set_updated_at before update on public.feature_flags
for each row execute function private.set_updated_at();
create trigger feature_flags_audit before update on public.feature_flags
for each row execute function private.audit_admin_change();

create function private.audit_admin_insert_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_audit_log (admin_id, action, target, before, after)
  values (
    (select auth.uid()), lower(tg_op), tg_table_name,
    case when tg_op = 'DELETE' then to_jsonb(old) - 'updated_by' - 'created_by' end,
    case when tg_op = 'INSERT' then to_jsonb(new) - 'updated_by' - 'created_by' end
  );
  return coalesce(new, old);
end;
$$;

create trigger feature_flags_audit_insert_delete after insert or delete on public.feature_flags
for each row execute function private.audit_admin_insert_delete();

insert into public.feature_flags (key, description, enabled) values
  ('ai.chat', 'Chat with documents', true),
  ('ai.mind_map', 'Mind map tool', true),
  ('documents.camera_scan', 'Scan pages with the camera', true),
  ('subscriptions.paywall', 'Show the Premium paywall', true);

alter table public.feature_flags enable row level security;
create policy "Staff read flags" on public.feature_flags for select to authenticated using ((select public.is_staff()));
create policy "Admins manage flags" on public.feature_flags for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.feature_flags from anon, authenticated;
grant select, insert, update, delete on public.feature_flags to authenticated;

------------------------------------------------------------------------------------------
-- Announcements (in-app banners), localised
------------------------------------------------------------------------------------------

create type public.announcement_audience as enum ('all', 'free', 'premium');

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  -- { "en": "…", "ar": "…", "fr": "…" }; English is required as the fallback.
  title jsonb not null check (jsonb_typeof(title) = 'object' and title ? 'en'),
  body jsonb not null check (jsonb_typeof(body) = 'object' and body ? 'en'),
  cta_label jsonb check (cta_label is null or jsonb_typeof(cta_label) = 'object'),
  cta_url text check (cta_url ~ '^(https://|studexa://)'),
  audience public.announcement_audience not null default 'all',
  platforms text[] not null default array['android', 'ios'],
  min_app_version text check (min_app_version ~ '^\d+(\.\d+){0,2}$'),
  priority smallint not null default 0,
  dismissible boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  check (ends_at is null or ends_at > starts_at)
);
create index announcements_active_idx on public.announcements (starts_at, ends_at);
create index announcements_updated_by_idx on public.announcements (updated_by);

create trigger announcements_set_updated_at before update on public.announcements
for each row execute function private.set_updated_at();
create trigger announcements_audit before update on public.announcements
for each row execute function private.audit_admin_change();
create trigger announcements_audit_insert_delete after insert or delete on public.announcements
for each row execute function private.audit_admin_insert_delete();

alter table public.announcements enable row level security;
create policy "Staff read announcements" on public.announcements for select to authenticated using ((select public.is_staff()));
create policy "Admins manage announcements" on public.announcements for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.announcements from anon, authenticated;
grant select, insert, update, delete on public.announcements to authenticated;

------------------------------------------------------------------------------------------
-- Client configuration: one cached call at app start (flags, public config, announcements)
------------------------------------------------------------------------------------------

create function public.get_client_config(p_platform text, p_app_version text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_tier public.plan_tier := case when v_user is null then 'free' else public.current_tier(v_user) end;
  v_version integer[] := private.version_parts(p_app_version);
begin
  return jsonb_build_object(
    'tier', v_tier,
    'flags', coalesce((
      select jsonb_object_agg(f.key,
        f.enabled
        and p_platform = any (f.platforms)
        and (f.min_app_version is null or v_version >= private.version_parts(f.min_app_version))
        and (f.tiers is null or v_tier = any (f.tiers))
        and (f.rollout_percent = 100
             or (v_user is not null and abs(hashtext(f.key || ':' || v_user::text)) % 100 < f.rollout_percent)))
      from public.feature_flags f), '{}'),
    'config', coalesce((select jsonb_object_agg(key, value) from public.app_config where is_public), '{}'),
    'announcements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'title', a.title, 'body', a.body, 'cta_label', a.cta_label, 'cta_url', a.cta_url,
        'dismissible', a.dismissible, 'priority', a.priority) order by a.priority desc, a.starts_at desc)
      from public.announcements a
      where a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
        and p_platform = any (a.platforms)
        and (a.min_app_version is null or v_version >= private.version_parts(a.min_app_version))
        and (a.audience = 'all' or a.audience::text = v_tier::text)), '[]')
  );
end;
$$;
grant execute on function public.get_client_config(text, text) to anon, authenticated;

------------------------------------------------------------------------------------------
-- Billing: RevenueCat webhook events → subscription state + anonymous revenue metrics
------------------------------------------------------------------------------------------

/**
 * Idempotent (event id) and order-safe (older events never overwrite newer state).
 * Returns 'processed' | 'duplicate' | 'stale' | 'unknown_user'.
 */
create function public.apply_billing_event(p_event jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p_event ->> 'id';
  v_type text := p_event ->> 'type';
  v_user uuid;
  v_at timestamptz := to_timestamp(coalesce((p_event ->> 'event_timestamp_ms')::bigint, 0) / 1000.0);
  v_expires timestamptz := to_timestamp((p_event ->> 'expiration_at_ms')::bigint / 1000.0);
  v_product text := left(p_event ->> 'product_id', 120);
  v_price numeric := coalesce((p_event ->> 'price')::numeric, 0);
  v_last timestamptz;
begin
  if v_id is null or v_type is null then
    raise exception 'invalid event' using errcode = 'invalid_parameter_value';
  end if;

  begin
    v_user := (p_event ->> 'app_user_id')::uuid;
  exception when invalid_text_representation then
    v_user := null;
  end;
  if v_user is not null and not exists (select 1 from public.profiles where id = v_user) then
    v_user := null;
  end if;

  insert into public.billing_events (id, user_id, type, payload)
  values (v_id, v_user, v_type, p_event)
  on conflict (id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  -- Revenue is aggregated anonymously (USD micros; refunds arrive with negative prices).
  if v_price <> 0 then
    perform private.bump_metric('revenue_usd_micros', coalesce(v_product, 'unknown'), round(v_price * 1000000)::bigint);
  end if;
  case v_type
    when 'INITIAL_PURCHASE' then
      perform private.bump_metric(case when p_event ->> 'period_type' = 'TRIAL' then 'trials_started' else 'subscriptions_started' end, coalesce(v_product, ''));
    when 'RENEWAL' then
      perform private.bump_metric('subscriptions_renewed', coalesce(v_product, ''));
    when 'CANCELLATION' then
      perform private.bump_metric('subscriptions_cancelled', coalesce(p_event ->> 'cancel_reason', ''));
    when 'EXPIRATION' then
      perform private.bump_metric('subscriptions_expired', coalesce(p_event ->> 'expiration_reason', ''));
    else null;
  end case;

  if v_user is null then
    update public.billing_events set processed_at = now() where id = v_id;
    return 'unknown_user';
  end if;

  select last_event_at into v_last from public.subscriptions where user_id = v_user for update;
  if v_last is not null and v_at < v_last then
    update public.billing_events set processed_at = now() where id = v_id;
    return 'stale';
  end if;

  update public.subscriptions s set
    tier = case
      when v_type in ('INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE', 'BILLING_ISSUE', 'CANCELLATION')
        then 'premium'::public.plan_tier
      when v_type = 'EXPIRATION' then 'free'::public.plan_tier
      else s.tier end,
    status = case v_type
      when 'INITIAL_PURCHASE' then 'active'
      when 'RENEWAL' then 'active'
      when 'UNCANCELLATION' then 'active'
      when 'PRODUCT_CHANGE' then 'active'
      when 'NON_RENEWING_PURCHASE' then 'active'
      when 'CANCELLATION' then 'cancelled'
      when 'BILLING_ISSUE' then 'billing_issue'
      when 'EXPIRATION' then 'expired'
      else s.status end::public.subscription_status,
    product_id = coalesce(v_product, s.product_id),
    store = coalesce(left(p_event ->> 'store', 32), s.store),
    current_period_end = coalesce(v_expires, s.current_period_end),
    will_renew = case when v_type in ('CANCELLATION', 'EXPIRATION') then false
                      when v_type in ('INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION') then true
                      else s.will_renew end,
    last_event_at = v_at
  where s.user_id = v_user;

  update public.billing_events set processed_at = now() where id = v_id;
  return 'processed';
end;
$$;
grant execute on function public.apply_billing_event(jsonb) to service_role;

------------------------------------------------------------------------------------------
-- Admin API (security definer; each function checks the caller's staff role and MFA)
------------------------------------------------------------------------------------------

create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  perform private.require_staff(array['support', 'analyst']::public.user_role[]);
  return jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'signups_7d', (select coalesce(sum(value), 0) from analytics.daily_metrics where metric = 'signups' and day > v_today - 7),
    'active_users_today', (select coalesce(sum(value), 0) from analytics.daily_metrics where metric = 'active_users' and day = v_today),
    'active_users_7d_avg', (select coalesce(round(sum(value) / 7.0), 0) from analytics.daily_metrics where metric = 'active_users' and day > v_today - 7),
    'premium_active', (select count(*) from public.subscriptions where tier = 'premium' and (current_period_end is null or current_period_end > now())),
    'ai_requests_today', (select coalesce(sum(value), 0) from analytics.daily_metrics where metric = 'ai_requests' and day = v_today),
    'ai_cost_today_usd', (select coalesce(sum(value), 0) / 1e6 from analytics.daily_metrics where metric = 'ai_cost_micros' and day = v_today),
    'ai_cost_30d_usd', (select coalesce(sum(value), 0) / 1e6 from analytics.daily_metrics where metric = 'ai_cost_micros' and day > v_today - 30),
    'revenue_30d_usd', (select coalesce(sum(value), 0) / 1e6 from analytics.daily_metrics where metric = 'revenue_usd_micros' and day > v_today - 30),
    'errors_24h', (select count(*) from public.error_logs where created_at > now() - interval '24 hours'),
    'documents_processing', (select count(*) from public.documents where status = 'processing'),
    'documents_failed_7d', (select coalesce(sum(value), 0) from analytics.daily_metrics where metric = 'documents_failed' and day > v_today - 7),
    'jobs_queued', (select count(*) from private.jobs where status = 'queued'),
    'jobs_dead', (select count(*) from private.jobs where status = 'dead' and finished_at > now() - interval '7 days')
  );
end;
$$;

/** Daily series for charts from the anonymous aggregates. */
create function public.admin_timeseries(p_metric text, p_days integer default 30)
returns table (day date, dimension text, value bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff(array['analyst']::public.user_role[]);
  return query
  select t.day, t.dimension, t.value from analytics.daily_metrics_totals t
  where t.metric = p_metric and t.day > (now() at time zone 'utc')::date - least(greatest(p_days, 1), 366)
  order by t.day, t.dimension;
end;
$$;

/**
 * Keyset-paginated user search. Query forms: a user id, an exact email, or a name prefix.
 * Pass the last row's created_at and id to fetch the next page.
 */
create function public.admin_list_users(
  p_query text default null,
  p_tier public.plan_tier default null,
  p_role public.user_role default null,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns table (
  id uuid, email text, display_name text, role public.user_role, tier public.plan_tier,
  email_verified boolean, created_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_query text := nullif(trim(p_query), '');
  v_id uuid;
begin
  perform private.require_staff(array['support']::public.user_role[]);
  if v_query ~* '^[0-9a-f-]{36}$' then
    v_id := v_query::uuid;
  end if;

  return query
  select p.id, u.email::text, p.display_name, p.role, s.tier, u.email_confirmed_at is not null,
    p.created_at, u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  join public.subscriptions s on s.user_id = p.id
  where (v_query is null
         or (v_id is not null and p.id = v_id)
         or (v_query like '%@%' and u.email = lower(v_query))
         or (v_query not like '%@%' and v_id is null and p.display_name ilike replace(replace(v_query, '%', ''), '_', '') || '%'))
    and (p_tier is null or s.tier = p_tier)
    and (p_role is null or p.role = p_role)
    and (p_before_created_at is null or (p.created_at, p.id) < (p_before_created_at, p_before_id))
  order by p.created_at desc, p.id desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;

create index profiles_created_idx on public.profiles (created_at desc, id desc);
create index profiles_display_name_trgm_idx on public.profiles using gin (display_name extensions.gin_trgm_ops);
create index profiles_staff_idx on public.profiles (role) where role <> 'user';

create function public.admin_get_user(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff(array['support']::public.user_role[]);
  return (
    select jsonb_build_object(
      'profile', to_jsonb(p),
      'auth', jsonb_build_object(
        'email', u.email, 'email_verified', u.email_confirmed_at is not null,
        'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
        'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]')),
      'subscription', (select to_jsonb(s) - 'user_id' from public.subscriptions s where s.user_id = p.id),
      'usage', (select coalesce(jsonb_agg(to_jsonb(c) - 'user_id'), '[]') from public.usage_counters c
                where c.user_id = p.id and c.period_start >= current_date - 31),
      'counts', jsonb_build_object(
        'documents', (select count(*) from public.documents where user_id = p.id),
        'storage_bytes', (select coalesce(sum(size_bytes), 0) from public.documents where user_id = p.id),
        'notes', (select count(*) from public.notes where user_id = p.id),
        'quizzes', (select count(*) from public.quizzes where user_id = p.id),
        'decks', (select count(*) from public.flashcard_decks where user_id = p.id),
        'conversations', (select count(*) from public.conversations where user_id = p.id)),
      'recent_errors', (select coalesce(jsonb_agg(e order by e.created_at desc), '[]') from (
        select id, severity, code, message, created_at from public.error_logs
        where user_id = p.id order by created_at desc limit 20) e),
      'billing_events', (select coalesce(jsonb_agg(b order by b.received_at desc), '[]') from (
        select id, type, received_at from public.billing_events
        where user_id = p.id order by received_at desc limit 20) b)
    )
    from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_user_id
  );
end;
$$;

create function public.admin_set_user_role(p_user_id uuid, p_role public.user_role) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_staff(array[]::public.user_role[]);
  v_before public.user_role;
begin
  select role into v_before from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'no_data_found';
  end if;
  if v_before = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'cannot remove the last admin' using errcode = 'check_violation';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  insert into public.admin_audit_log (admin_id, action, target, before, after)
  values (v_actor, 'set_role', 'profiles:' || p_user_id,
    jsonb_build_object('role', v_before), jsonb_build_object('role', p_role));
end;
$$;

/** Manual grant (support compensation, press, testers). Store purchases are managed by RevenueCat. */
create function public.admin_set_subscription(p_user_id uuid, p_tier public.plan_tier, p_period_end timestamptz, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_staff(array[]::public.user_role[]);
  v_before jsonb;
begin
  if char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'a reason is required' using errcode = 'invalid_parameter_value';
  end if;
  select to_jsonb(s) - 'user_id' into v_before from public.subscriptions s where user_id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'no_data_found';
  end if;
  update public.subscriptions set
    tier = p_tier,
    status = (case when p_tier = 'premium' then 'active' else 'none' end)::public.subscription_status,
    store = case when p_tier = 'premium' then 'manual' else store end,
    current_period_end = p_period_end,
    will_renew = false
  where user_id = p_user_id;
  insert into public.admin_audit_log (admin_id, action, target, before, after)
  values (v_actor, 'set_subscription', 'subscriptions:' || p_user_id, v_before,
    jsonb_build_object('tier', p_tier, 'current_period_end', p_period_end, 'reason', left(p_reason, 500)));
end;
$$;

create function public.admin_subscriptions_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  perform private.require_staff(array['analyst', 'support']::public.user_role[]);
  return jsonb_build_object(
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
      select status, count(*) n from public.subscriptions where tier = 'premium' group by status) s),
    'by_product', (select coalesce(jsonb_object_agg(coalesce(product_id, 'unknown'), n), '{}') from (
      select product_id, count(*) n from public.subscriptions
      where tier = 'premium' and (current_period_end is null or current_period_end > now()) group by product_id) s),
    'started_30d', (select coalesce(sum(value), 0) from analytics.daily_metrics where metric = 'subscriptions_started' and day > v_today - 30),
    'trials_30d', (select coalesce(sum(value), 0) from analytics.daily_metrics where metric = 'trials_started' and day > v_today - 30),
    'cancelled_30d', (select coalesce(sum(value), 0) from analytics.daily_metrics where metric = 'subscriptions_cancelled' and day > v_today - 30),
    'expired_30d', (select coalesce(sum(value), 0) from analytics.daily_metrics where metric = 'subscriptions_expired' and day > v_today - 30),
    'revenue_30d_usd', (select coalesce(sum(value), 0) / 1e6 from analytics.daily_metrics where metric = 'revenue_usd_micros' and day > v_today - 30)
  );
end;
$$;

create function public.admin_list_errors(
  p_source public.error_source default null,
  p_severity public.error_severity default null,
  p_code text default null,
  p_before_id bigint default null,
  p_limit integer default 50
)
returns table (id bigint, user_id uuid, source public.error_source, severity public.error_severity, code text,
  message text, context jsonb, app_version text, platform text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff(array['support']::public.user_role[]);
  return query
  select e.id, e.user_id, e.source, e.severity, e.code, e.message, e.context, e.app_version, e.platform, e.created_at
  from public.error_logs e
  where (p_source is null or e.source = p_source)
    and (p_severity is null or e.severity = p_severity)
    and (p_code is null or e.code = p_code)
    and (p_before_id is null or e.id < p_before_id)
  order by e.id desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;

create function public.admin_error_groups(p_hours integer default 24)
returns table (code text, source public.error_source, occurrences bigint, users bigint, last_seen timestamptz, sample_message text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff(array['support']::public.user_role[]);
  return query
  select coalesce(e.code, '(none)'), e.source, count(*), count(distinct e.user_id), max(e.created_at),
    (array_agg(e.message order by e.created_at desc))[1]
  from public.error_logs e
  where e.created_at > now() - make_interval(hours => least(greatest(p_hours, 1), 24 * 30))
  group by 1, 2
  order by 3 desc
  limit 100;
end;
$$;

create function public.admin_documents_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff(array['support', 'analyst']::public.user_role[]);
  return jsonb_build_object(
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
      select status, count(*) n from public.documents group by status) s),
    'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}') from (
      select kind, count(*) n from public.documents group by kind) s),
    'stuck', (select count(*) from public.documents where status = 'processing' and updated_at < now() - interval '30 minutes'),
    'recent_failures', (select coalesce(jsonb_agg(f), '[]') from (
      select id, user_id, kind, size_bytes, error_code, updated_at from public.documents
      where status = 'failed' order by updated_at desc limit 50) f),
    'jobs', (select coalesce(jsonb_agg(j), '[]') from (
      select kind, status, count(*) n, min(run_after) filter (where status = 'queued') oldest_queued
      from private.jobs group by kind, status) j)
  );
end;
$$;

create function public.admin_retry_document(p_document_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_staff(array['support']::public.user_role[]);
  v_doc public.documents%rowtype;
begin
  select * into v_doc from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'document not found' using errcode = 'no_data_found';
  end if;
  if v_doc.status <> 'failed' then
    return 'not_failed';
  end if;
  update public.documents set status = 'processing', error_code = null where id = p_document_id;
  perform public.enqueue_job('document_extract', jsonb_build_object('document_id', p_document_id), p_document_id::text);
  insert into public.admin_audit_log (admin_id, action, target) values (v_actor, 'retry_document', 'documents:' || p_document_id);
  return 'queued';
end;
$$;

create function public.admin_storage_usage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff(array['analyst', 'support']::public.user_role[]);
  return jsonb_build_object(
    'total_bytes', (select coalesce(sum(size_bytes), 0) from public.documents),
    'documents', (select count(*) from public.documents),
    'by_kind', (select coalesce(jsonb_object_agg(kind, jsonb_build_object('bytes', b, 'count', n)), '{}') from (
      select kind, sum(size_bytes) b, count(*) n from public.documents group by kind) s),
    'top_users', (select coalesce(jsonb_agg(t), '[]') from (
      select d.user_id, sum(d.size_bytes) bytes, count(*) documents
      from public.documents d group by d.user_id order by 2 desc limit 20) t),
    'database_bytes', pg_database_size(current_database())
  );
end;
$$;

create function public.admin_system_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff(array['analyst', 'support']::public.user_role[]);
  return jsonb_build_object(
    'checked_at', now(),
    'jobs', (select coalesce(jsonb_agg(j), '[]') from (
      select kind, status, count(*) n,
        extract(epoch from now() - min(run_after) filter (where status = 'queued'))::integer oldest_queued_seconds
      from private.jobs where status in ('queued', 'running', 'dead') group by kind, status) j),
    'services', (select coalesce(jsonb_agg(s order by s.service), '[]') from (
      select service, instance, version, last_seen, details,
        last_seen > now() - interval '5 minutes' as healthy
      from private.service_heartbeats where last_seen > now() - interval '1 day') s),
    'errors_last_hour', (select count(*) from public.error_logs where created_at > now() - interval '1 hour'),
    'fatal_last_hour', (select count(*) from public.error_logs where created_at > now() - interval '1 hour' and severity = 'fatal'),
    'ai_enabled', (select value from public.app_config where key = 'ai.enabled'),
    'ai_spend_today_usd', public.ai_spend_today_usd(),
    'ai_budget_usd', (select value from public.app_config where key = 'ai.daily_budget_usd'),
    'last_maintenance', (select value from public.app_config where key = 'system.last_maintenance'),
    'database_bytes', pg_database_size(current_database())
  );
end;
$$;

-- Audit rows about a deleted user stay (accountability) but no longer identify them.
create function private.anonymise_audit_targets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.admin_audit_log set target = split_part(target, ':', 1) || ':deleted-user'
  where target in ('profiles:' || old.id, 'subscriptions:' || old.id, 'users:' || old.id);
  return old;
end;
$$;
create trigger on_profile_deleted_anonymise_audit after delete on public.profiles
for each row execute function private.anonymise_audit_targets();

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_overview()', 'admin_timeseries(text, integer)',
    'admin_list_users(text, public.plan_tier, public.user_role, timestamptz, uuid, integer)',
    'admin_get_user(uuid)', 'admin_set_user_role(uuid, public.user_role)',
    'admin_set_subscription(uuid, public.plan_tier, timestamptz, text)', 'admin_subscriptions_summary()',
    'admin_list_errors(public.error_source, public.error_severity, text, bigint, integer)',
    'admin_error_groups(integer)', 'admin_documents_status()', 'admin_retry_document(uuid)',
    'admin_storage_usage()', 'admin_system_health()'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

------------------------------------------------------------------------------------------
-- Maintenance: finished jobs and stale heartbeats; record the run for system health
------------------------------------------------------------------------------------------

create or replace function private.run_maintenance() returns void
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
  delete from private.email_codes where expires_at < now();
  delete from auth.users
  where email_confirmed_at is null
    and coalesce(raw_app_meta_data ->> 'provider', 'email') = 'email'
    and created_at < now() - make_interval(days => (v_retention ->> 'unverified_accounts_days')::integer);
  delete from private.jobs where status = 'succeeded' and finished_at < now() - interval '7 days';
  delete from private.jobs where status = 'dead' and finished_at < now() - interval '30 days';
  delete from private.service_heartbeats where last_seen < now() - interval '7 days';

  -- Uploads that were started but never completed (the storage trigger removes any file).
  delete from public.documents where status = 'pending_upload' and created_at < now() - interval '1 day';

  -- A document whose extraction job died (or vanished) must not spin forever in the app.
  update public.documents d set status = 'failed', error_code = 'processing_timeout'
  where d.status = 'processing' and d.updated_at < now() - interval '15 minutes'
    and not exists (
      select 1 from private.jobs j
      where j.kind = 'document_extract' and j.dedupe_key = d.id::text and j.status in ('queued', 'running')
    );

  insert into public.app_config (key, value, description)
  values ('system.last_maintenance', to_jsonb(now()), 'Set by private.run_maintenance().')
  on conflict (key) do update set value = excluded.value;
end;
$$;
