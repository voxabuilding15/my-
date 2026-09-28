-- Authentication support: one-time email codes (verification and password reset), email
-- verification gating for quota-consuming actions, session revocation, publicly readable
-- config (legal URLs), and cleanup of accounts that never verified.
--
-- Why our own codes instead of Supabase's built-in OTP: Supabase's verify endpoint is callable
-- directly with the public anon key, so a per-code attempt limit enforced elsewhere could be
-- bypassed. Codes issued here are verified only by the auth-email-code Edge Function, which
-- makes the 10-minute expiry, 5-attempt limit and single active code enforceable.

create type public.email_code_purpose as enum ('verify_email', 'reset_password');

insert into public.app_config (key, value, is_public, description) values
  ('auth.email_codes', '{
      "ttl_seconds": 600,
      "resend_after_seconds": 60,
      "max_attempts": 5,
      "max_sends_per_hour": 5
    }', false, 'One-time email code policy.'),
  ('legal', '{
      "privacy_url": "https://voxabuilding15.github.io/my-/privacy/",
      "terms_url": "https://voxabuilding15.github.io/my-/terms/",
      "account_deletion_url": "https://voxabuilding15.github.io/my-/delete-account/",
      "support_email": null
    }', true, 'Legal and support links shown in the app. Change here when moving to a custom domain.');

update public.app_config
set value = value || '{"unverified_accounts_days": 7}'
where key = 'retention';

------------------------------------------------------------------------------------------
-- Public config is readable before sign-in (sign-up screen links to the Terms)
------------------------------------------------------------------------------------------

create policy "Anyone reads public config" on public.app_config
for select to anon using (is_public);
grant select on public.app_config to anon;

------------------------------------------------------------------------------------------
-- One-time email codes
------------------------------------------------------------------------------------------

-- One row per user and purpose: issuing a new code replaces (and so invalidates) the previous
-- one. Only an HMAC of the code is stored; the key (pepper) lives in Edge Function secrets.
create table private.email_codes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  purpose public.email_code_purpose not null,
  code_hash text not null,
  attempts smallint not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, purpose)
);

create function private.email_code_policy() returns jsonb
language sql stable set search_path = '' as $$
  select value from public.app_config where key = 'auth.email_codes';
$$;

create function public.issue_email_code(
  p_user_id uuid,
  p_purpose public.email_code_purpose,
  p_code_hash text
)
returns table (issued boolean, retry_after_seconds integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_policy jsonb := private.email_code_policy();
  v_resend_after integer := (v_policy ->> 'resend_after_seconds')::integer;
  v_last timestamptz;
begin
  select created_at into v_last from private.email_codes
  where user_id = p_user_id and purpose = p_purpose
  for update;

  if v_last is not null and v_last > now() - make_interval(secs => v_resend_after) then
    return query select false,
      ceil(extract(epoch from (v_last + make_interval(secs => v_resend_after) - now())))::integer;
    return;
  end if;

  if not public.check_rate_limit(
    'email_code:' || p_purpose || ':' || p_user_id,
    (v_policy ->> 'max_sends_per_hour')::integer,
    3600
  ) then
    return query select false, 3600;
    return;
  end if;

  insert into private.email_codes (user_id, purpose, code_hash, expires_at)
  values (p_user_id, p_purpose, p_code_hash, now() + make_interval(secs => (v_policy ->> 'ttl_seconds')::integer))
  on conflict (user_id, purpose) do update set
    code_hash = excluded.code_hash,
    attempts = 0,
    expires_at = excluded.expires_at,
    created_at = now();

  return query select true, v_resend_after;
end;
$$;

-- status: valid | invalid | expired | too_many_attempts | no_code
create function public.verify_email_code(
  p_user_id uuid,
  p_purpose public.email_code_purpose,
  p_code_hash text,
  p_consume boolean
)
returns table (status text, attempts_remaining integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_max integer := (private.email_code_policy() ->> 'max_attempts')::integer;
  v_code private.email_codes%rowtype;
begin
  select * into v_code from private.email_codes
  where user_id = p_user_id and purpose = p_purpose
  for update;

  if not found then
    return query select 'no_code', 0;
    return;
  end if;

  if v_code.expires_at <= now() then
    delete from private.email_codes where user_id = p_user_id and purpose = p_purpose;
    return query select 'expired', 0;
    return;
  end if;

  if v_code.code_hash = p_code_hash then
    if p_consume then
      delete from private.email_codes where user_id = p_user_id and purpose = p_purpose;
    end if;
    return query select 'valid', v_max - v_code.attempts;
    return;
  end if;

  if v_code.attempts + 1 >= v_max then
    delete from private.email_codes where user_id = p_user_id and purpose = p_purpose;
    return query select 'too_many_attempts', 0;
    return;
  end if;

  update private.email_codes set attempts = attempts + 1
  where user_id = p_user_id and purpose = p_purpose;
  return query select 'invalid', v_max - v_code.attempts - 1;
end;
$$;

grant execute on function public.issue_email_code(uuid, public.email_code_purpose, text) to service_role;
grant execute on function public.verify_email_code(uuid, public.email_code_purpose, text, boolean) to service_role;

------------------------------------------------------------------------------------------
-- Account lookups and session revocation (server-only)
------------------------------------------------------------------------------------------

create function public.find_auth_user_by_email(p_email text)
returns table (user_id uuid, email_verified boolean, has_password boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email_confirmed_at is not null,
    coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'email'
  from auth.users u
  where lower(u.email) = lower(trim(p_email));
$$;

-- Signs the user out everywhere (after a password reset). Refresh tokens cascade from sessions;
-- access tokens expire within jwt_expiry.
create function public.revoke_user_sessions(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

grant execute on function public.find_auth_user_by_email(text) to service_role;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

------------------------------------------------------------------------------------------
-- Email verification gates everything that consumes quota (AI, OCR, uploads)
------------------------------------------------------------------------------------------

create function private.is_email_verified(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select email_confirmed_at is not null from auth.users where id = p_user_id), false);
$$;

drop function public.consume_quota(uuid, public.usage_metric, integer);

-- reason: NULL when allowed, else 'email_unverified' | 'quota_exceeded'
create function public.consume_quota(p_user_id uuid, p_metric public.usage_metric, p_quantity integer default 1)
returns table (allowed boolean, used integer, quota integer, reason text)
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

  if not private.is_email_verified(p_user_id) then
    return query select false, 0, v_limit, 'email_unverified';
    return;
  end if;

  insert into public.usage_counters (user_id, metric, period_start)
  values (p_user_id, p_metric, v_period)
  on conflict do nothing;

  update public.usage_counters c set used = c.used + p_quantity
  where c.user_id = p_user_id and c.metric = p_metric and c.period_start = v_period
    and (v_limit is null or c.used + p_quantity <= v_limit)
  returning c.used into v_used;

  if found then
    return query select true, v_used, v_limit, null::text;
  else
    return query
    select false, c.used, v_limit, 'quota_exceeded' from public.usage_counters c
    where c.user_id = p_user_id and c.metric = p_metric and c.period_start = v_period;
  end if;
end;
$$;
grant execute on function public.consume_quota(uuid, public.usage_metric, integer) to service_role;

create or replace function public.authorize_upload(p_user_id uuid, p_size_bytes bigint)
returns table (allowed boolean, reason text)
language plpgsql security definer set search_path = '' as $$
declare
  v_limits public.plan_limits%rowtype;
  v_stored bigint;
  v_quota record;
begin
  if not private.is_email_verified(p_user_id) then
    return query select false, 'email_unverified';
    return;
  end if;

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

  select * into v_quota from public.consume_quota(p_user_id, 'uploads');
  if not v_quota.allowed then
    return query select false, v_quota.reason;
    return;
  end if;

  return query select true, null::text;
end;
$$;

------------------------------------------------------------------------------------------
-- Maintenance: also remove email/password accounts that never verified (frees the address
-- for its real owner, who can in any case reclaim it earlier through password reset).
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
end;
$$;
