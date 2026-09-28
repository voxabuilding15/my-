-- AI: runtime configuration, request admission (kill switch, budget, rate limits, quotas),
-- usage accounting, atomic saving of generated quizzes and decks, embeddings for large
-- documents, and anonymous-to-staff answer reports with a content snapshot for review.

------------------------------------------------------------------------------------------
-- Configuration (edited in the admin dashboard; defaults live in packages/ai)
------------------------------------------------------------------------------------------

insert into public.app_config (key, value, is_public, description) values
  ('ai.routes', '{}', false,
   'Per-action model overrides, e.g. {"chat": {"model": "claude-haiku-4-5", "maxTokens": 2048}, "quiz": {"model": "claude-sonnet-5-5", "effort": "medium"}}. Empty = built-in defaults.'),
  ('ai.pricing', '{}', false,
   'USD per million tokens per model, e.g. {"claude-haiku-4-5": {"input": 1, "output": 5, "cacheWrite": 1.25, "cacheRead": 0.1}}. Empty = built-in prices.'),
  ('ai.rate_limits', '{"per_minute": 12, "per_hour": 150}', false,
   'Maximum AI requests per user per minute and per hour (on top of plan quotas).'),
  ('ai.context', '{"history_messages": 20, "max_context_tokens": 150000}', false,
   'Chat turns sent with each question, and the most document text sent in one request.')
on conflict (key) do nothing;

------------------------------------------------------------------------------------------
-- Admission and accounting
------------------------------------------------------------------------------------------

/**
 * Admits one AI request: global kill switch, daily budget, per-user rate limits, then every
 * quota the action draws from (all or nothing). reason: NULL when allowed, else
 * 'ai_disabled' | 'budget_exceeded' | 'rate_limited' | 'email_unverified' | 'quota_exceeded'.
 * `remaining` is what is left of the first metric after this request (NULL = unlimited).
 */
create function public.begin_ai_request(p_user_id uuid, p_metrics public.usage_metric[])
returns table (allowed boolean, reason text, remaining integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_limits jsonb := coalesce((select value from public.app_config where key = 'ai.rate_limits'), '{}');
  v_budget numeric := (select (value #>> '{}')::numeric from public.app_config where key = 'ai.daily_budget_usd');
  v_metric public.usage_metric;
  v_consumed public.usage_metric[] := '{}';
  v_quota record;
  v_remaining integer;
begin
  if coalesce((select value = 'false'::jsonb from public.app_config where key = 'ai.enabled'), false) then
    return query select false, 'ai_disabled', null::integer;
    return;
  end if;
  if v_budget is not null and public.ai_spend_today_usd() >= v_budget then
    return query select false, 'budget_exceeded', null::integer;
    return;
  end if;
  if not public.check_rate_limit('ai_minute:' || p_user_id, coalesce((v_limits ->> 'per_minute')::integer, 12), 60)
     or not public.check_rate_limit('ai_hour:' || p_user_id, coalesce((v_limits ->> 'per_hour')::integer, 150), 3600) then
    return query select false, 'rate_limited', null::integer;
    return;
  end if;

  foreach v_metric in array p_metrics loop
    select * into v_quota from public.consume_quota(p_user_id, v_metric);
    if not v_quota.allowed then
      foreach v_metric in array v_consumed loop
        perform public.release_quota(p_user_id, v_metric);
      end loop;
      return query select false, v_quota.reason, null::integer;
      return;
    end if;
    if cardinality(v_consumed) = 0 then
      v_remaining := case when v_quota.quota is null then null else greatest(0, v_quota.quota - v_quota.used) end;
    end if;
    v_consumed := v_consumed || v_metric;
  end loop;
  return query select true, null::text, v_remaining;
end;
$$;

/**
 * Records one model call (tokens, estimated cost, latency) for analytics and budgets, and gives
 * the quota back when the request failed, so users never pay for errors.
 */
create function public.finish_ai_request(
  p_user_id uuid,
  p_action public.ai_action,
  p_metrics public.usage_metric[],
  p_succeeded boolean,
  p_model text default null,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_cached_input_tokens integer default 0,
  p_cost_micros bigint default 0,
  p_latency_ms integer default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_metric public.usage_metric;
begin
  if not p_succeeded then
    foreach v_metric in array p_metrics loop
      perform public.release_quota(p_user_id, v_metric);
    end loop;
  end if;
  -- A failure before any model call has nothing to record.
  if p_model is null then
    return;
  end if;
  insert into public.usage_events (user_id, tier, action, model, input_tokens, output_tokens,
    cached_input_tokens, cost_micros, latency_ms, succeeded)
  values (p_user_id, public.current_tier(p_user_id), p_action, left(p_model, 100), greatest(p_input_tokens, 0),
    greatest(p_output_tokens, 0), greatest(p_cached_input_tokens, 0), greatest(p_cost_micros, 0),
    p_latency_ms, p_succeeded);
end;
$$;

grant execute on function public.begin_ai_request(uuid, public.usage_metric[]) to service_role;
grant execute on function public.finish_ai_request(uuid, public.ai_action, public.usage_metric[], boolean, text, integer, integer, integer, bigint, integer) to service_role;

------------------------------------------------------------------------------------------
-- Generated study material, saved atomically (a quiz never appears half-written)
------------------------------------------------------------------------------------------

/** p_questions: [{type, prompt, choices|null, correct_answer, explanation, source_page}] */
create function public.save_generated_quiz(
  p_user_id uuid,
  p_document_id uuid,
  p_title text,
  p_time_limit_seconds integer,
  p_model text,
  p_questions jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_quiz uuid;
  v_pages integer := (select page_count from public.documents where id = p_document_id and user_id = p_user_id);
begin
  if v_pages is null then
    raise exception 'document not found' using errcode = 'no_data_found';
  end if;
  insert into public.quizzes (user_id, document_id, title, time_limit_seconds, model)
  values (p_user_id, p_document_id, left(p_title, 200), p_time_limit_seconds, left(p_model, 100))
  returning id into v_quiz;

  insert into public.quiz_questions (quiz_id, user_id, position, type, prompt, choices, correct_answer, explanation, source_page)
  select v_quiz, p_user_id, (q.ordinality - 1)::integer, (q.value ->> 'type')::public.quiz_question_type,
    q.value ->> 'prompt',
    case when jsonb_typeof(q.value -> 'choices') = 'array'
      then array(select jsonb_array_elements_text(q.value -> 'choices')) end,
    q.value ->> 'correct_answer',
    nullif(q.value ->> 'explanation', ''),
    -- A page the document does not have is dropped rather than shown.
    case when (q.value ->> 'source_page')::integer between 1 and v_pages then (q.value ->> 'source_page')::integer end
  from jsonb_array_elements(p_questions) with ordinality q;

  perform private.bump_metric('quizzes_generated');
  return v_quiz;
end;
$$;

/** p_cards: [{front, back}] — new cards start in the FSRS "new" state. */
create function public.save_generated_deck(
  p_user_id uuid,
  p_document_id uuid,
  p_title text,
  p_cards jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_deck uuid;
begin
  if not exists (select 1 from public.documents where id = p_document_id and user_id = p_user_id) then
    raise exception 'document not found' using errcode = 'no_data_found';
  end if;
  insert into public.flashcard_decks (user_id, document_id, title)
  values (p_user_id, p_document_id, left(p_title, 200))
  returning id into v_deck;

  insert into public.flashcards (deck_id, user_id, position, front, back)
  select v_deck, p_user_id, (c.ordinality - 1)::integer, left(c.value ->> 'front', 2000), left(c.value ->> 'back', 4000)
  from jsonb_array_elements(p_cards) with ordinality c;

  perform private.bump_metric('decks_generated');
  return v_deck;
end;
$$;

grant execute on function public.save_generated_quiz(uuid, uuid, text, integer, text, jsonb) to service_role;
grant execute on function public.save_generated_deck(uuid, uuid, text, jsonb) to service_role;

------------------------------------------------------------------------------------------
-- Embeddings for large (hybrid) documents
------------------------------------------------------------------------------------------

create function public.get_active_embedding_model()
returns table (id smallint, provider text, model text, dimensions integer)
language sql stable security definer set search_path = '' as $$
  select id, provider, model, dimensions from public.embedding_models where is_active limit 1;
$$;

/** Chunks of a document still missing a vector for the given model. */
create function public.get_chunks_to_embed(p_document_id uuid, p_model_id smallint, p_limit integer default 256)
returns table (chunk_id uuid, content text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.content from public.document_chunks c
  where c.document_id = p_document_id
    and not exists (select 1 from public.document_chunk_embeddings e where e.chunk_id = c.id and e.model_id = p_model_id)
  order by c.chunk_index
  limit least(greatest(p_limit, 1), 1000);
$$;

/** p_items: [{chunk_id, embedding: [..numbers..]}]; idempotent. */
create function public.save_chunk_embeddings(p_document_id uuid, p_model_id smallint, p_items jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.document_chunk_embeddings (chunk_id, model_id, document_id, user_id, embedding)
  select c.id, p_model_id, c.document_id, c.user_id, (i.value -> 'embedding')::text::extensions.vector
  from jsonb_array_elements(p_items) i
  join public.document_chunks c on c.id = (i.value ->> 'chunk_id')::uuid and c.document_id = p_document_id
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.get_active_embedding_model() to service_role;
grant execute on function public.get_chunks_to_embed(uuid, smallint, integer) to service_role;
grant execute on function public.save_chunk_embeddings(uuid, smallint, jsonb) to service_role;

------------------------------------------------------------------------------------------
-- "Report this answer": the reported text is copied for reviewers; the dashboard never
-- shows who reported it.
------------------------------------------------------------------------------------------

alter table public.content_reports
  add column content_snapshot text check (char_length(content_snapshot) <= 20000),
  add column model text check (char_length(model) <= 100);

create function private.snapshot_reported_content() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Only the reporter's own content can be reported (and snapshotted).
  if new.target_type = 'message' then
    select left(m.content, 20000), m.model into new.content_snapshot, new.model
    from public.messages m where m.id = new.target_id and m.user_id = new.reporter_id and m.role = 'assistant';
  elsif new.target_type = 'ai_output' then
    select left(coalesce(o.content ->> 'markdown', o.content::text), 20000), o.model into new.content_snapshot, new.model
    from public.ai_outputs o where o.id = new.target_id and o.user_id = new.reporter_id;
  end if;
  if new.target_type in ('message', 'ai_output') and new.content_snapshot is null then
    raise exception 'content not found' using errcode = 'no_data_found';
  end if;
  return new;
end;
$$;

create trigger content_reports_snapshot before insert on public.content_reports
for each row execute function private.snapshot_reported_content();

-- Reports need not be re-filed for the same answer.
create unique index content_reports_once_idx on public.content_reports (reporter_id, target_type, target_id)
where target_id is not null;

create function private.count_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.bump_metric('ai_reports', new.reason::text);
  return new;
end;
$$;
create trigger content_reports_count after insert on public.content_reports
for each row execute function private.count_report();
