-- Background jobs, document processing pipeline, service heartbeats and staff authorization.

------------------------------------------------------------------------------------------
-- Staff authorization
--
-- Staff functions require the role AND, by default, a multi-factor session (JWT aal2): a stolen
-- admin password alone cannot reach user data. Disable only for local development via
-- app_config 'admin.require_mfa'.
------------------------------------------------------------------------------------------

insert into public.app_config (key, value, is_public, description) values
  ('admin.require_mfa', 'true', false, 'Staff functions require a multi-factor (aal2) session.'),
  ('documents.processing', '{
      "max_attempts": 5,
      "chunk_target_tokens": 800,
      "chunk_overlap_tokens": 120
    }', false, 'Document extraction worker settings.')
on conflict (key) do nothing;

create function private.mfa_satisfied() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'false'::jsonb from public.app_config where key = 'admin.require_mfa'), false)
    or coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

/** The caller's staff role, or NULL for regular users and staff without MFA. */
create function public.staff_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.role <> 'user' and private.mfa_satisfied();
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.staff_role() = 'admin', false);
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.staff_role() is not null;
$$;

/** Raises unless the caller has one of the roles (admins always pass). Returns the caller id. */
create function private.require_staff(p_roles public.user_role[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.user_role := public.staff_role();
begin
  if v_role is null or not (v_role = 'admin' or v_role = any (p_roles)) then
    raise exception 'staff access required' using errcode = 'insufficient_privilege';
  end if;
  return (select auth.uid());
end;
$$;

grant execute on function public.staff_role() to authenticated;
grant execute on function public.is_staff() to authenticated;

------------------------------------------------------------------------------------------
-- Job queue
--
-- Postgres-backed queue (no extra infrastructure): leases with SKIP LOCKED claiming, retries
-- with exponential backoff and jitter, a dead-letter state after max_attempts, and dedupe keys
-- so a document is never queued twice. Payloads hold ids only, never personal data.
------------------------------------------------------------------------------------------

create type private.job_status as enum ('queued', 'running', 'succeeded', 'dead');

create table private.jobs (
  id bigint generated always as identity primary key,
  kind text not null check (kind ~ '^[a-z_]+$'),
  payload jsonb not null default '{}',
  dedupe_key text,
  status private.job_status not null default 'queued',
  priority smallint not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 50),
  run_after timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  last_error text check (char_length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index jobs_active_dedupe_idx on private.jobs (kind, dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running');
create index jobs_ready_idx on private.jobs (kind, priority desc, run_after) where status = 'queued';
create index jobs_leased_idx on private.jobs (locked_until) where status = 'running';
create index jobs_finished_idx on private.jobs using brin (finished_at);

create function public.enqueue_job(
  p_kind text,
  p_payload jsonb default '{}',
  p_dedupe_key text default null,
  p_priority smallint default 0,
  p_max_attempts integer default 5,
  p_delay_seconds integer default 0
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  insert into private.jobs (kind, payload, dedupe_key, priority, max_attempts, run_after)
  values (p_kind, p_payload, p_dedupe_key, p_priority, p_max_attempts, now() + make_interval(secs => p_delay_seconds))
  on conflict (kind, dedupe_key) where dedupe_key is not null and status in ('queued', 'running')
  do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from private.jobs
    where kind = p_kind and dedupe_key = p_dedupe_key and status in ('queued', 'running');
  end if;
  return v_id;
end;
$$;

/** Claims up to p_limit ready jobs for a worker; expired leases (crashed workers) are reclaimed first. */
create function public.claim_jobs(p_kind text, p_worker text, p_limit integer default 1, p_lease_seconds integer default 300)
returns setof private.jobs
language plpgsql security definer set search_path = '' as $$
begin
  update private.jobs
  set status = case when attempts >= max_attempts then 'dead'::private.job_status else 'queued' end,
      locked_by = null, locked_until = null, updated_at = now(),
      last_error = coalesce(last_error, 'lease expired'),
      finished_at = case when attempts >= max_attempts then now() end
  where kind = p_kind and status = 'running' and locked_until < now();

  return query
  update private.jobs j
  set status = 'running', attempts = j.attempts + 1, locked_by = p_worker,
      locked_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  where j.id in (
    select id from private.jobs
    where kind = p_kind and status = 'queued' and run_after <= now()
    order by priority desc, run_after
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning j.*;
end;
$$;

create function public.complete_job(p_job_id bigint, p_worker text) returns boolean
language sql security definer set search_path = '' as $$
  update private.jobs
  set status = 'succeeded', locked_by = null, locked_until = null, finished_at = now(), updated_at = now()
  where id = p_job_id and status = 'running' and locked_by = p_worker
  returning true;
$$;

/**
 * Retryable failures back off exponentially (30 s · 2^(attempt-1), capped at 1 h, ±20% jitter);
 * permanent failures, or the last attempt, move the job to the dead-letter state.
 */
create function public.fail_job(p_job_id bigint, p_worker text, p_error text, p_retryable boolean default true)
returns private.job_status
language plpgsql security definer set search_path = '' as $$
declare
  v_job private.jobs%rowtype;
  v_delay double precision;
begin
  select * into v_job from private.jobs where id = p_job_id and status = 'running' and locked_by = p_worker for update;
  if not found then
    return null;
  end if;

  if p_retryable and v_job.attempts < v_job.max_attempts then
    v_delay := least(3600, 30 * power(2, v_job.attempts - 1)) * (0.8 + random() * 0.4);
    update private.jobs
    set status = 'queued', run_after = now() + make_interval(secs => v_delay), locked_by = null,
        locked_until = null, last_error = left(p_error, 2000), updated_at = now()
    where id = p_job_id;
    return 'queued';
  end if;

  update private.jobs
  set status = 'dead', locked_by = null, locked_until = null, last_error = left(p_error, 2000),
      finished_at = now(), updated_at = now()
  where id = p_job_id;
  perform private.bump_metric('jobs_dead', v_job.kind);
  return 'dead';
end;
$$;

grant execute on function public.enqueue_job(text, jsonb, text, smallint, integer, integer) to service_role;
grant execute on function public.claim_jobs(text, text, integer, integer) to service_role;
grant execute on function public.complete_job(bigint, text) to service_role;
grant execute on function public.fail_job(bigint, text, text, boolean) to service_role;

------------------------------------------------------------------------------------------
-- Service heartbeats (system health in the dashboard)
------------------------------------------------------------------------------------------

create table private.service_heartbeats (
  service text not null check (char_length(service) <= 64),
  instance text not null check (char_length(instance) <= 128),
  version text check (char_length(version) <= 64),
  details jsonb not null default '{}' check (pg_column_size(details) <= 8192),
  last_seen timestamptz not null default now(),
  primary key (service, instance)
);

create function public.record_heartbeat(p_service text, p_instance text, p_version text, p_details jsonb default '{}')
returns void
language sql security definer set search_path = '' as $$
  insert into private.service_heartbeats (service, instance, version, details, last_seen)
  values (p_service, p_instance, p_version, p_details, now())
  on conflict (service, instance) do update
  set version = excluded.version, details = excluded.details, last_seen = now();
$$;
grant execute on function public.record_heartbeat(text, text, text, jsonb) to service_role;

------------------------------------------------------------------------------------------
-- Document processing pipeline
--
--   app → document-upload/create (quota check, row + signed upload URL) → Storage
--       → document-upload/complete → queue_document_processing → job 'document_extract'
--       → Cloud Run worker: download, sha256 → reuse_document_extraction (same file already
--         extracted for this user: copy, done) or extract → save_document_extraction
------------------------------------------------------------------------------------------

alter table public.documents
  add column content_sha256 text check (content_sha256 ~ '^[0-9a-f]{64}$'),
  add column processed_at timestamptz,
  add column extraction_version smallint;

create index documents_user_hash_idx on public.documents (user_id, content_sha256) where status = 'ready';
create index documents_status_idx on public.documents (status, created_at) where status <> 'ready';

/** Creates the document row for an upload after quota checks. Storage path: {user}/{document}/original.{ext} */
create function public.create_document_upload(
  p_user_id uuid,
  p_title text,
  p_kind public.document_kind,
  p_mime_type text,
  p_size_bytes bigint,
  p_extension text
)
returns table (allowed boolean, reason text, document_id uuid, storage_path text)
language plpgsql security definer set search_path = '' as $$
declare
  v_auth record;
  v_id uuid := gen_random_uuid();
  v_path text;
begin
  if p_extension !~ '^[a-z0-9]{1,5}$' then
    raise exception 'invalid extension' using errcode = 'invalid_parameter_value';
  end if;
  select * into v_auth from public.authorize_upload(p_user_id, p_size_bytes);
  if not v_auth.allowed then
    return query select false, v_auth.reason, null::uuid, null::text;
    return;
  end if;
  v_path := p_user_id || '/' || v_id || '/original.' || p_extension;
  insert into public.documents (id, user_id, title, kind, mime_type, size_bytes, storage_path, status)
  values (v_id, p_user_id, left(coalesce(nullif(trim(p_title), ''), 'Untitled'), 200), p_kind, p_mime_type, p_size_bytes, v_path, 'pending_upload');
  return query select true, null::text, v_id, v_path;
end;
$$;

/** After the upload: result 'queued' | 'already_processing' | 'already_ready'. */
create function public.queue_document_processing(p_document_id uuid, p_user_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.document_status;
begin
  select status into v_status from public.documents where id = p_document_id and user_id = p_user_id for update;
  if not found then
    raise exception 'document not found' using errcode = 'no_data_found';
  end if;
  if v_status = 'ready' then
    return 'already_ready';
  end if;
  if v_status = 'processing' then
    return 'already_processing';
  end if;

  update public.documents set status = 'processing', error_code = null where id = p_document_id;
  perform public.enqueue_job(
    'document_extract',
    jsonb_build_object('document_id', p_document_id),
    p_document_id::text,
    0::smallint,
    coalesce((select (value ->> 'max_attempts')::integer from public.app_config where key = 'documents.processing'), 5)
  );
  return 'queued';
end;
$$;

/**
 * Extract once: called by the worker after hashing the downloaded file. When this user already
 * has a ready document with identical content, its text, chunks and embeddings are copied and
 * the document becomes ready without extraction (returns true). The cache is per user, so no
 * content is ever shared between accounts.
 */
create function public.reuse_document_extraction(p_document_id uuid, p_content_sha256 text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.documents%rowtype;
  v_source public.documents%rowtype;
begin
  select * into v_doc from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'document not found' using errcode = 'no_data_found';
  end if;
  update public.documents set content_sha256 = p_content_sha256 where id = p_document_id;

  select * into v_source from public.documents
  where user_id = v_doc.user_id and content_sha256 = p_content_sha256 and status = 'ready' and id <> p_document_id
  order by processed_at desc nulls last limit 1;
  if not found then
    return false;
  end if;

  delete from public.document_chunks where document_id = p_document_id;
  delete from public.document_pages where document_id = p_document_id;

  insert into public.document_pages (document_id, user_id, page_number, content, ocr_applied)
  select p_document_id, v_doc.user_id, page_number, content, ocr_applied
  from public.document_pages where document_id = v_source.id;

  insert into public.document_chunks (document_id, user_id, chunk_index, page_start, page_end, content, token_count, ts_config)
  select p_document_id, v_doc.user_id, chunk_index, page_start, page_end, content, token_count, ts_config
  from public.document_chunks where document_id = v_source.id;

  insert into public.document_chunk_embeddings (chunk_id, model_id, document_id, user_id, embedding)
  select target.id, e.model_id, p_document_id, v_doc.user_id, e.embedding
  from public.document_chunk_embeddings e
  join public.document_chunks source on source.id = e.chunk_id
  join public.document_chunks target on target.document_id = p_document_id and target.chunk_index = source.chunk_index
  where e.document_id = v_source.id;

  update public.documents set
    status = 'ready', page_count = v_source.page_count, token_count = v_source.token_count,
    language = v_source.language, ts_config = v_source.ts_config, retrieval_mode = v_source.retrieval_mode,
    extraction_version = v_source.extraction_version, processed_at = now(), error_code = null
  where id = p_document_id;
  perform private.bump_metric('documents_extraction_cached', v_doc.kind::text);
  return true;
end;
$$;

/** Everything the worker needs, including the plan's page limit and retrieval thresholds. */
create function public.get_document_for_processing(p_document_id uuid)
returns table (
  document_id uuid,
  user_id uuid,
  kind public.document_kind,
  mime_type text,
  storage_path text,
  status public.document_status,
  max_pages integer,
  full_context_max_tokens integer,
  chunk_target_tokens integer,
  chunk_overlap_tokens integer
)
language sql stable security definer set search_path = '' as $$
  select d.id, d.user_id, d.kind, d.mime_type, d.storage_path, d.status,
    l.max_pages_per_document,
    (r.value ->> 'full_context_max_tokens')::integer,
    (r.value ->> 'chunk_target_tokens')::integer,
    (r.value ->> 'chunk_overlap_tokens')::integer
  from public.documents d
  join public.plan_limits l on l.tier = public.current_tier(d.user_id)
  cross join (select value from public.app_config where key = 'retrieval') r
  where d.id = p_document_id;
$$;

/**
 * Atomically replaces a document's extracted text (idempotent: safe to retry).
 * p_pages:  [{ "number": 1, "text": "…", "ocr": false }]
 * p_chunks: [{ "index": 0, "page_start": 1, "page_end": 2, "content": "…", "tokens": 812 }]
 */
create function public.save_document_extraction(
  p_document_id uuid,
  p_pages jsonb,
  p_chunks jsonb,
  p_token_count integer,
  p_language text,
  p_ts_config text,
  p_retrieval_mode public.retrieval_mode,
  p_extraction_version smallint
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.documents%rowtype;
  v_config regconfig;
begin
  select * into v_doc from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'document not found' using errcode = 'no_data_found';
  end if;
  v_config := case when exists (select 1 from pg_catalog.pg_ts_config where cfgname = p_ts_config)
    then p_ts_config::regconfig else 'simple'::regconfig end;

  delete from public.document_chunks where document_id = p_document_id;
  delete from public.document_pages where document_id = p_document_id;

  insert into public.document_pages (document_id, user_id, page_number, content, ocr_applied)
  select p_document_id, v_doc.user_id, (p ->> 'number')::integer, p ->> 'text', coalesce((p ->> 'ocr')::boolean, false)
  from jsonb_array_elements(p_pages) p;

  insert into public.document_chunks (document_id, user_id, chunk_index, page_start, page_end, content, token_count, ts_config)
  select p_document_id, v_doc.user_id, (c ->> 'index')::integer, (c ->> 'page_start')::integer,
    (c ->> 'page_end')::integer, c ->> 'content', (c ->> 'tokens')::integer, v_config
  from jsonb_array_elements(coalesce(p_chunks, '[]')) c;

  update public.documents set
    status = 'ready', page_count = jsonb_array_length(p_pages), token_count = p_token_count,
    language = nullif(p_language, ''), ts_config = v_config, retrieval_mode = p_retrieval_mode,
    extraction_version = p_extraction_version, processed_at = now(), error_code = null
  where id = p_document_id;

  perform private.bump_metric('documents_processed', v_doc.kind::text);
  perform private.bump_metric('document_pages_processed', v_doc.kind::text, jsonb_array_length(p_pages));

  -- Hybrid documents get embeddings from the AI pipeline.
  if p_retrieval_mode = 'hybrid' then
    perform public.enqueue_job('document_embed', jsonb_build_object('document_id', p_document_id), p_document_id::text);
  end if;
end;
$$;

create function public.mark_document_failed(p_document_id uuid, p_error_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_kind public.document_kind;
begin
  update public.documents set status = 'failed', error_code = left(p_error_code, 64)
  where id = p_document_id
  returning kind into v_kind;
  if found then
    perform private.bump_metric('documents_failed', p_error_code);
  end if;
end;
$$;

grant execute on function public.create_document_upload(uuid, text, public.document_kind, text, bigint, text) to service_role;
grant execute on function public.queue_document_processing(uuid, uuid) to service_role;
grant execute on function public.reuse_document_extraction(uuid, text) to service_role;
grant execute on function public.get_document_for_processing(uuid) to service_role;
grant execute on function public.save_document_extraction(uuid, jsonb, jsonb, integer, text, text, public.retrieval_mode, smallint) to service_role;
grant execute on function public.mark_document_failed(uuid, text) to service_role;

-- Error volume for system health and the errors dashboard.
create function private.count_error() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.bump_metric('errors', new.source::text || ':' || new.severity::text);
  return new;
end;
$$;
create trigger error_logs_count after insert on public.error_logs
for each row execute function private.count_error();

------------------------------------------------------------------------------------------
-- Storage janitor: drains the deletion queue filled by document and account deletion
------------------------------------------------------------------------------------------

create function public.claim_storage_deletions(p_limit integer default 20)
returns table (id bigint, bucket_id text, path_prefix text)
language sql security definer set search_path = '' as $$
  update private.storage_deletion_queue q
  set attempts = q.attempts + 1
  where q.id in (
    select id from private.storage_deletion_queue
    where attempts < 10
    order by enqueued_at
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  )
  returning q.id, q.bucket_id, q.path_prefix;
$$;

create function public.finish_storage_deletion(p_id bigint, p_error text default null) returns void
language sql security definer set search_path = '' as $$
  delete from private.storage_deletion_queue where id = p_id and p_error is null;
  update private.storage_deletion_queue set last_error = left(p_error, 2000) where id = p_id and p_error is not null;
$$;

grant execute on function public.claim_storage_deletions(integer) to service_role;
grant execute on function public.finish_storage_deletion(bigint, text) to service_role;
