-- Foundation: extensions, internal schemas, enumerated types and shared helpers.
--
-- Schemas
--   public     user-facing tables exposed through the Data API, every table protected by RLS
--   private    internal tables and functions; never exposed to clients
--   analytics  anonymous aggregate metrics only (no user identifiers, survives account deletion)

create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

create schema if not exists private;
create schema if not exists analytics;

revoke all on schema private, analytics from public, anon, authenticated;
grant usage on schema private, analytics to service_role;

-- Functions are executable by PUBLIC by default, and Supabase additionally grants anon and
-- authenticated on the public schema. Deny both so every client-callable function is granted
-- explicitly (verified by the privileges test).
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

------------------------------------------------------------------------------------------
-- Enumerated types (mirrors of packages/shared constants)
------------------------------------------------------------------------------------------

create type public.plan_tier as enum ('free', 'premium');
create type public.user_role as enum ('user', 'admin');
create type public.app_locale as enum ('en', 'ar', 'fr');
create type public.theme_preference as enum ('system', 'light', 'dark');

create type public.document_kind as enum ('pdf', 'docx', 'txt', 'image');
create type public.document_status as enum ('pending_upload', 'processing', 'ready', 'failed');
-- full_context: whole text is sent to the model (with prompt caching).
-- hybrid: document is chunked; retrieval combines full-text search and embeddings.
create type public.retrieval_mode as enum ('full_context', 'hybrid');

create type public.ai_action as enum (
  'explain', 'summarize', 'translate', 'quiz', 'flashcards', 'eli10', 'notes',
  'mind_map', 'study_plan', 'practice_questions', 'document_qa', 'ocr'
);
create type public.chat_role as enum ('user', 'assistant');

create type public.quiz_question_type as enum ('multiple_choice', 'true_false', 'short_answer');
create type public.quiz_attempt_status as enum ('in_progress', 'submitted');

create type public.flashcard_state as enum ('new', 'learning', 'review', 'relearning');

create type public.note_source as enum ('manual', 'ai');

create type public.usage_metric as enum (
  'ai_requests', 'uploads', 'quizzes', 'flashcard_decks', 'ocr_scans', 'chat_messages'
);

create type public.subscription_status as enum (
  'none', 'active', 'in_grace_period', 'billing_issue', 'cancelled', 'expired'
);

create type public.error_source as enum ('mobile', 'edge_function', 'admin');
create type public.error_severity as enum ('info', 'warning', 'error', 'fatal');

create type public.report_target as enum ('ai_output', 'message', 'quiz', 'flashcard_deck', 'other');
create type public.report_reason as enum ('incorrect', 'harmful', 'offensive', 'other');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

------------------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------------------

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.is_valid_timezone(tz text) returns boolean
language plpgsql stable set search_path = '' as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

-- Sharded counters: concurrent writers pick a random bucket so a hot metric never becomes a
-- single-row lock bottleneck. Read through analytics.daily_metrics_totals.
create table analytics.daily_metrics (
  day date not null,
  metric text not null,
  dimension text not null default '',
  bucket smallint not null,
  value bigint not null default 0,
  primary key (day, metric, dimension, bucket)
);

create view analytics.daily_metrics_totals as
select day, metric, dimension, sum(value)::bigint as value
from analytics.daily_metrics
group by day, metric, dimension;

create function private.bump_metric(p_metric text, p_dimension text default '', p_amount bigint default 1)
returns void
language sql security definer set search_path = '' as $$
  insert into analytics.daily_metrics (day, metric, dimension, bucket, value)
  values ((now() at time zone 'utc')::date, p_metric, coalesce(p_dimension, ''), floor(random() * 16)::smallint, p_amount)
  on conflict (day, metric, dimension, bucket)
  do update set value = analytics.daily_metrics.value + excluded.value;
$$;

revoke all on all tables in schema analytics from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
