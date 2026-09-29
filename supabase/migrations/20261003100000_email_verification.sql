------------------------------------------------------------------------------------------
-- Email verification is tracked in app_metadata, not auth.users.email_confirmed_at.
--
-- With Supabase "Confirm email" turned off (our own 6-digit codes replace confirmation
-- links), GoTrue sets email_confirmed_at at signup, so it cannot tell verified accounts
-- apart. Found by the Phase 7 integration tests against a real GoTrue.
--
-- raw_app_meta_data can only be written with the service role, so users cannot mark
-- themselves verified. auth-email-code sets app_metadata.email_verified = true after a
-- correct code. Accounts that signed in with any provider other than email (Google) count
-- as verified: the provider has already checked the address.
--
-- No backfill: Studexa has not launched, and existing email_confirmed_at values cannot tell a
-- code-verified account from an auto-confirmed one.
------------------------------------------------------------------------------------------

create function private.email_verified_from_meta(p_meta jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce((p_meta ->> 'email_verified')::boolean, false)
    or coalesce(p_meta ->> 'provider', 'email') <> 'email'
    or exists (
      select 1 from jsonb_array_elements_text(coalesce(p_meta -> 'providers', '[]'::jsonb)) as p(name)
      where p.name <> 'email'
    );
$$;

revoke all on function private.email_verified_from_meta(jsonb) from public;

create or replace function private.is_email_verified(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select private.email_verified_from_meta(raw_app_meta_data) from auth.users where id = p_user_id),
    false);
$$;

create or replace function public.find_auth_user_by_email(p_email text)
returns table (user_id uuid, email_verified boolean, has_password boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, private.email_verified_from_meta(u.raw_app_meta_data),
    coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'email'
  from auth.users u
  where lower(u.email) = lower(trim(p_email));
$$;

create or replace function public.admin_list_users(
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
  select p.id, u.email::text, p.display_name, p.role, s.tier, private.email_verified_from_meta(u.raw_app_meta_data),
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

create or replace function public.admin_get_user(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff(array['support']::public.user_role[]);
  return (
    select jsonb_build_object(
      'profile', to_jsonb(p),
      'auth', jsonb_build_object(
        'email', u.email, 'email_verified', private.email_verified_from_meta(u.raw_app_meta_data),
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
  where not private.email_verified_from_meta(raw_app_meta_data)
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
