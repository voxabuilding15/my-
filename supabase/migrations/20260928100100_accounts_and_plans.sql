-- Accounts: profiles, settings, subscriptions, admin-editable plan limits and app config.
--
-- Every user-owned table references public.profiles(id) with ON DELETE CASCADE, and profiles
-- references auth.users with ON DELETE CASCADE, so deleting the auth user erases all personal
-- data in one statement (GDPR Art. 17 / Google Play account deletion).

------------------------------------------------------------------------------------------
-- Profiles
------------------------------------------------------------------------------------------

-- CHECK constraints execute with the writer's privileges, so the validator must be executable
-- by clients (it stays unreachable through the API because the private schema isn't exposed).
grant execute on function private.is_valid_timezone(text) to authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 80),
  avatar_path text check (char_length(avatar_path) <= 512),
  timezone text not null default 'UTC' check (private.is_valid_timezone(timezone)),
  role public.user_role not null default 'user',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'
  );
$$;
grant execute on function public.is_admin() to authenticated, service_role;

alter table public.profiles enable row level security;

create policy "Users read their own profile" on public.profiles
for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));

create policy "Users update their own profile" on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Column-level grants: users can never change their own role (privilege escalation).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path, timezone, onboarding_completed_at) on public.profiles to authenticated;

------------------------------------------------------------------------------------------
-- Settings
------------------------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme public.theme_preference not null default 'system',
  locale public.app_locale,
  daily_reminder_enabled boolean not null default true,
  daily_reminder_time time not null default '19:00',
  study_reminder_days smallint[] not null default '{}'
    check (study_reminder_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  daily_goal_minutes smallint not null default 20 check (daily_goal_minutes between 5 and 600),
  speech_rate real not null default 1.0 check (speech_rate between 0.5 and 2.0),
  marketing_emails boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger user_settings_set_updated_at before update on public.user_settings
for each row execute function private.set_updated_at();

alter table public.user_settings enable row level security;

create policy "Users read their own settings" on public.user_settings
for select to authenticated using (user_id = (select auth.uid()));

create policy "Users update their own settings" on public.user_settings
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.user_settings from anon, authenticated;
grant select on public.user_settings to authenticated;
grant update (
  theme, locale, daily_reminder_enabled, daily_reminder_time, study_reminder_days,
  daily_goal_minutes, speech_rate, marketing_emails
) on public.user_settings to authenticated;

------------------------------------------------------------------------------------------
-- Plan limits (edited from the admin dashboard; mirrors planLimitsSchema in packages/shared)
------------------------------------------------------------------------------------------

create table public.plan_limits (
  tier public.plan_tier primary key,
  ai_requests_per_day integer check (ai_requests_per_day >= 0),
  uploads_per_month integer check (uploads_per_month >= 0),
  max_file_size_mb integer not null check (max_file_size_mb between 1 and 50),
  max_pages_per_document integer check (max_pages_per_document > 0),
  quizzes_per_day integer check (quizzes_per_day >= 0),
  flashcard_decks_per_day integer check (flashcard_decks_per_day >= 0),
  ocr_scans_per_day integer check (ocr_scans_per_day >= 0),
  chat_messages_per_day integer check (chat_messages_per_day >= 0),
  storage_mb integer check (storage_mb > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
comment on table public.plan_limits is 'NULL in a limit column means unlimited.';
comment on column public.plan_limits.max_file_size_mb is 'Upper bound 50 matches the storage bucket file_size_limit.';

create index plan_limits_updated_by_idx on public.plan_limits (updated_by);

create trigger plan_limits_set_updated_at before update on public.plan_limits
for each row execute function private.set_updated_at();

insert into public.plan_limits (
  tier, ai_requests_per_day, uploads_per_month, max_file_size_mb, max_pages_per_document,
  quizzes_per_day, flashcard_decks_per_day, ocr_scans_per_day, chat_messages_per_day, storage_mb
) values
  ('free', 20, 5, 10, 50, 3, 3, 10, 30, 100),
  ('premium', null, null, 50, null, null, null, null, null, 10240);

alter table public.plan_limits enable row level security;

create policy "Everyone signed in reads plan limits" on public.plan_limits
for select to authenticated using (true);

create policy "Admins update plan limits" on public.plan_limits
for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.plan_limits from anon, authenticated;
grant select on public.plan_limits to authenticated;
grant update (
  ai_requests_per_day, uploads_per_month, max_file_size_mb, max_pages_per_document,
  quizzes_per_day, flashcard_decks_per_day, ocr_scans_per_day, chat_messages_per_day, storage_mb
) on public.plan_limits to authenticated;

------------------------------------------------------------------------------------------
-- Subscriptions (written only by the RevenueCat webhook via service_role)
------------------------------------------------------------------------------------------

create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  tier public.plan_tier not null default 'free',
  status public.subscription_status not null default 'none',
  product_id text,
  store text,
  current_period_end timestamptz,
  will_renew boolean,
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

create index subscriptions_active_idx on public.subscriptions (tier, current_period_end)
where tier = 'premium';

create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function private.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "Users read their own subscription" on public.subscriptions
for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

-- Raw webhook deliveries, keyed by RevenueCat event id for idempotent processing.
create table public.billing_events (
  id text primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index billing_events_user_id_idx on public.billing_events (user_id);
create index billing_events_received_at_idx on public.billing_events using brin (received_at);

alter table public.billing_events enable row level security;
create policy "Admins read billing events" on public.billing_events
for select to authenticated using ((select public.is_admin()));
revoke all on public.billing_events from anon, authenticated;
grant select on public.billing_events to authenticated;

create function public.current_tier(p_user_id uuid) returns public.plan_tier
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select 'premium'::public.plan_tier
     from public.subscriptions s
     where s.user_id = p_user_id
       and s.tier = 'premium'
       and (s.current_period_end is null or s.current_period_end > now())),
    'free'
  );
$$;
grant execute on function public.current_tier(uuid) to service_role;

------------------------------------------------------------------------------------------
-- App configuration (feature flags, AI model routing, retrieval thresholds, budgets)
------------------------------------------------------------------------------------------

create table public.app_config (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  value jsonb not null,
  is_public boolean not null default false,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
create index app_config_updated_by_idx on public.app_config (updated_by);

create trigger app_config_set_updated_at before update on public.app_config
for each row execute function private.set_updated_at();

insert into public.app_config (key, value, is_public, description) values
  ('app.min_supported_version', '"0.1.0"', true, 'Older app versions are asked to update.'),
  ('ai.enabled', 'true', true, 'Global kill switch for all AI features.'),
  ('ai.daily_budget_usd', '200', false, 'AI calls are refused once today''s estimated spend exceeds this.'),
  ('retrieval', '{
      "full_context_max_tokens": 100000,
      "chunk_target_tokens": 800,
      "chunk_overlap_tokens": 120,
      "match_count": 8
    }', false, 'Documents above full_context_max_tokens use hybrid retrieval with embeddings.'),
  ('retention', '{
      "usage_events_days": 90,
      "error_logs_days": 30,
      "billing_events_days": 400
    }', false, 'Data minimisation: rows older than this are purged by private.run_maintenance().');

alter table public.app_config enable row level security;

create policy "Signed-in users read public config" on public.app_config
for select to authenticated using (is_public or (select public.is_admin()));

create policy "Admins update config" on public.app_config
for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to authenticated;
grant update (value, is_public, description) on public.app_config to authenticated;

------------------------------------------------------------------------------------------
-- Admin audit log
------------------------------------------------------------------------------------------

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_admin_id_idx on public.admin_audit_log (admin_id);
create index admin_audit_log_created_at_idx on public.admin_audit_log using brin (created_at);

alter table public.admin_audit_log enable row level security;
create policy "Admins read the audit log" on public.admin_audit_log
for select to authenticated using ((select public.is_admin()));
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

-- Snapshots exclude authorship columns so the log never retains the identity of a deleted
-- admin; admin_id (ON DELETE SET NULL) is the only link to a person.
create function private.audit_admin_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_before jsonb := to_jsonb(old) - 'updated_by' - 'updated_at';
  v_after jsonb := to_jsonb(new) - 'updated_by' - 'updated_at';
begin
  -- Nothing but authorship changed (e.g. updated_by nulled when an admin account is deleted).
  if v_before = v_after then
    return new;
  end if;
  if v_actor is not null then
    new.updated_by := v_actor;
  end if;
  insert into public.admin_audit_log (admin_id, action, target, before, after)
  values (v_actor, lower(tg_op), tg_table_name, v_before, v_after);
  return new;
end;
$$;

create trigger plan_limits_audit before update on public.plan_limits
for each row execute function private.audit_admin_change();
create trigger app_config_audit before update on public.app_config
for each row execute function private.audit_admin_change();

------------------------------------------------------------------------------------------
-- Sign-up / deletion hooks
------------------------------------------------------------------------------------------

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name'
  )), '');
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(v_name, 80));
  insert into public.user_settings (user_id) values (new.id);
  insert into public.subscriptions (user_id) values (new.id);
  perform private.bump_metric('signups');
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create function private.handle_profile_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.bump_metric('accounts_deleted');
  return old;
end;
$$;

create trigger on_profile_deleted after delete on public.profiles
for each row execute function private.handle_profile_deleted();
