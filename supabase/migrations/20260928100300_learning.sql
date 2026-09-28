-- Learning content: chat, cached AI outputs, notes, quizzes and flashcards.
--
-- Client-writable tables accept client-generated ids so the app can create rows offline and
-- render them optimistically.
--
-- Content derived from a document survives the document's deletion where it has standalone
-- value (notes, quizzes, flashcard decks keep document_id = NULL); chats and cached AI outputs
-- are scoped to their document and are deleted with it.

------------------------------------------------------------------------------------------
-- Conversations & messages (each document has its own chat history)
------------------------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  document_id uuid,
  title text not null default '' check (char_length(title) <= 200),
  message_count integer not null default 0,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);
create index conversations_user_recent_idx on public.conversations (user_id, last_message_at desc nulls last);
create index conversations_document_user_idx on public.conversations (document_id, user_id);
create index conversations_title_trgm_idx on public.conversations using gin (title extensions.gin_trgm_ops);

create trigger conversations_set_updated_at before update on public.conversations
for each row execute function private.set_updated_at();

alter table public.conversations enable row level security;
create policy "Users manage their own conversations" on public.conversations
for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.conversations from anon, authenticated;
grant select, delete on public.conversations to authenticated;
grant insert (id, user_id, document_id, title) on public.conversations to authenticated;
grant update (title) on public.conversations to authenticated;

-- Messages are written by the AI Edge Function (user turn + assistant reply in one transaction).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null,
  role public.chat_role not null,
  content text not null check (char_length(content) <= 100000),
  -- [{ "page": 3, "chunk_id": "…" }] — pages the answer was grounded in.
  citations jsonb not null default '[]' check (jsonb_typeof(citations) = 'array'),
  model text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', content)) stored,
  foreign key (conversation_id, user_id) references public.conversations (id, user_id) on delete cascade
);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index messages_user_id_idx on public.messages (user_id);
create index messages_search_idx on public.messages using gin (search);

create function private.touch_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations
  set message_count = message_count + 1, last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation after insert on public.messages
for each row execute function private.touch_conversation();

alter table public.messages enable row level security;
create policy "Users read their own messages" on public.messages
for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;

------------------------------------------------------------------------------------------
-- AI outputs (summaries, explanations, translations, mind maps, study plans…)
-- Doubles as a cache: an identical request returns the stored result without a model call.
------------------------------------------------------------------------------------------

create table public.ai_outputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  document_id uuid,
  action public.ai_action not null,
  page_number integer check (page_number >= 1),
  target_language text check (target_language ~ '^[a-z]{2,3}$'),
  -- Hash of any remaining request parameters (e.g. difficulty, length), '' when none.
  params_hash text not null default '',
  content jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);
create unique index ai_outputs_cache_key_idx on public.ai_outputs
  (user_id, document_id, action, page_number, target_language, params_hash) nulls not distinct;
create index ai_outputs_document_user_idx on public.ai_outputs (document_id, user_id);
create index ai_outputs_user_recent_idx on public.ai_outputs (user_id, created_at desc);

alter table public.ai_outputs enable row level security;
create policy "Users read their own AI outputs" on public.ai_outputs
for select to authenticated using (user_id = (select auth.uid()));
create policy "Users delete their own AI outputs" on public.ai_outputs
for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.ai_outputs from anon, authenticated;
grant select, delete on public.ai_outputs to authenticated;

------------------------------------------------------------------------------------------
-- Notes
------------------------------------------------------------------------------------------

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  document_id uuid,
  title text not null default '' check (char_length(title) <= 200),
  content text not null default '' check (char_length(content) <= 200000),
  is_pinned boolean not null default false,
  source public.note_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple', title || ' ' || content)) stored,
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete set null (document_id)
);
create index notes_user_list_idx on public.notes (user_id, is_pinned desc, updated_at desc);
create index notes_document_user_idx on public.notes (document_id, user_id);
create index notes_search_idx on public.notes using gin (search);

create trigger notes_set_updated_at before update on public.notes
for each row execute function private.set_updated_at();

alter table public.notes enable row level security;
create policy "Users manage their own notes" on public.notes
for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notes from anon, authenticated;
grant select, delete on public.notes to authenticated;
grant insert (id, user_id, document_id, title, content, is_pinned) on public.notes to authenticated;
grant update (document_id, title, content, is_pinned) on public.notes to authenticated;

------------------------------------------------------------------------------------------
-- Quizzes
------------------------------------------------------------------------------------------

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  document_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  time_limit_seconds integer check (time_limit_seconds between 30 and 14400),
  question_count integer not null default 0,
  model text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete set null (document_id)
);
create index quizzes_user_recent_idx on public.quizzes (user_id, created_at desc);
create index quizzes_document_user_idx on public.quizzes (document_id, user_id);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null,
  user_id uuid not null,
  position integer not null check (position >= 0),
  type public.quiz_question_type not null,
  prompt text not null check (char_length(prompt) between 1 and 2000),
  choices text[],
  correct_answer text not null check (char_length(correct_answer) between 1 and 2000),
  explanation text check (char_length(explanation) <= 4000),
  source_page integer check (source_page >= 1),
  unique (quiz_id, position),
  unique (id, user_id),
  unique (id, quiz_id),
  foreign key (quiz_id, user_id) references public.quizzes (id, user_id) on delete cascade,
  constraint quiz_questions_shape check (
    case type
      when 'multiple_choice' then
        cardinality(choices) between 2 and 6 and correct_answer = any (choices)
      when 'true_false' then
        choices is null and correct_answer in ('true', 'false')
      when 'short_answer' then
        choices is null
    end
  )
);
create index quiz_questions_user_id_idx on public.quiz_questions (user_id);

create function private.count_quiz_questions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.quizzes q
  set question_count = (select count(*) from public.quiz_questions where quiz_id = q.id)
  where q.id = coalesce(new.quiz_id, old.quiz_id);
  return null;
end;
$$;

create trigger quiz_questions_count after insert or delete on public.quiz_questions
for each row execute function private.count_quiz_questions();

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null,
  user_id uuid not null,
  status public.quiz_attempt_status not null default 'in_progress',
  time_limit_seconds integer,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  timed_out boolean not null default false,
  score integer check (score >= 0),
  max_score integer check (max_score >= 0),
  unique (id, user_id),
  unique (id, quiz_id),
  foreign key (quiz_id, user_id) references public.quizzes (id, user_id) on delete cascade,
  check ((status = 'submitted') = (submitted_at is not null))
);
create index quiz_attempts_quiz_user_idx on public.quiz_attempts (quiz_id, user_id);
create index quiz_attempts_user_recent_idx on public.quiz_attempts (user_id, started_at desc);

create table public.quiz_answers (
  attempt_id uuid not null,
  question_id uuid not null,
  quiz_id uuid not null,
  user_id uuid not null,
  answer text not null check (char_length(answer) <= 2000),
  -- NULL = needs grading (short answers are graded by the AI function).
  is_correct boolean,
  primary key (attempt_id, question_id),
  foreign key (attempt_id, user_id) references public.quiz_attempts (id, user_id) on delete cascade,
  foreign key (attempt_id, quiz_id) references public.quiz_attempts (id, quiz_id) on delete cascade,
  -- Guarantees the question belongs to the same quiz as the attempt.
  foreign key (question_id, quiz_id) references public.quiz_questions (id, quiz_id) on delete cascade
);
create index quiz_answers_question_quiz_idx on public.quiz_answers (question_id, quiz_id);
create index quiz_answers_user_id_idx on public.quiz_answers (user_id);

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;

create policy "Users read their own quizzes" on public.quizzes
for select to authenticated using (user_id = (select auth.uid()));
create policy "Users delete their own quizzes" on public.quizzes
for delete to authenticated using (user_id = (select auth.uid()));
create policy "Users rename their own quizzes" on public.quizzes
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users read their own quiz questions" on public.quiz_questions
for select to authenticated using (user_id = (select auth.uid()));
create policy "Users read their own attempts" on public.quiz_attempts
for select to authenticated using (user_id = (select auth.uid()));
create policy "Users read their own answers" on public.quiz_answers
for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.quizzes, public.quiz_questions, public.quiz_attempts, public.quiz_answers
  from anon, authenticated;
grant select, delete on public.quizzes to authenticated;
grant update (title) on public.quizzes to authenticated;
grant select on public.quiz_questions, public.quiz_attempts, public.quiz_answers to authenticated;

create function public.start_quiz_attempt(p_quiz_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_limit integer;
  v_attempt uuid;
begin
  select time_limit_seconds into v_limit
  from public.quizzes where id = p_quiz_id and user_id = v_user;
  if not found then
    raise exception 'quiz not found' using errcode = 'no_data_found';
  end if;

  insert into public.quiz_attempts (quiz_id, user_id, time_limit_seconds)
  values (p_quiz_id, v_user, v_limit)
  returning id into v_attempt;
  return v_attempt;
end;
$$;

-- Normalises free text for comparison: case, surrounding/inner whitespace, trailing punctuation.
create function private.normalize_answer(p_text text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(lower(trim(p_text)), '\s+', ' ', 'g'), '[[:punct:]]+$', '')
$$;

-- p_answers: { "<question_id>": "<answer>", … }. Grades objective questions server-side so the
-- score can be trusted in statistics; short answers that don't match exactly stay ungraded
-- (is_correct NULL) for AI grading.
create function public.submit_quiz_attempt(p_attempt_id uuid, p_answers jsonb)
returns table (score integer, max_score integer, pending_grading integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_attempt public.quiz_attempts%rowtype;
  v_grace constant interval := interval '15 seconds';
begin
  if jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'answers must be a JSON object' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_attempt from public.quiz_attempts
  where id = p_attempt_id and user_id = v_user
  for update;
  if not found then
    raise exception 'attempt not found' using errcode = 'no_data_found';
  end if;
  if v_attempt.status = 'submitted' then
    raise exception 'attempt already submitted' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.quiz_answers (attempt_id, question_id, quiz_id, user_id, answer, is_correct)
  select v_attempt.id, q.id, q.quiz_id, v_user, left(a.value, 2000),
    case
      when private.normalize_answer(a.value) = private.normalize_answer(q.correct_answer) then true
      when q.type = 'short_answer' then null
      else false
    end
  from jsonb_each_text(p_answers) a
  join public.quiz_questions q on q.id::text = a.key and q.quiz_id = v_attempt.quiz_id;

  update public.quiz_attempts qa set
    status = 'submitted',
    submitted_at = now(),
    timed_out = qa.time_limit_seconds is not null
      and now() > qa.started_at + make_interval(secs => qa.time_limit_seconds) + v_grace,
    max_score = (select count(*) from public.quiz_questions where quiz_id = qa.quiz_id),
    score = (select count(*) from public.quiz_answers where attempt_id = qa.id and is_correct)
  where qa.id = v_attempt.id;

  perform private.record_activity(v_user, 'quiz_completed');
  perform private.bump_metric('quizzes_completed');

  return query
  select qa.score, qa.max_score,
    (select count(*)::integer from public.quiz_answers where attempt_id = qa.id and is_correct is null)
  from public.quiz_attempts qa where qa.id = v_attempt.id;
end;
$$;

------------------------------------------------------------------------------------------
-- Flashcards with FSRS spaced-repetition state
--
-- Scheduling is computed on the device (FSRS in packages/shared) and persisted with
-- review_flashcard(); a user's schedule only affects that user, so the client is trusted with it.
------------------------------------------------------------------------------------------

create table public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  document_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  card_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete set null (document_id)
);
create index flashcard_decks_user_recent_idx on public.flashcard_decks (user_id, updated_at desc);
create index flashcard_decks_document_user_idx on public.flashcard_decks (document_id, user_id);

create trigger flashcard_decks_set_updated_at before update on public.flashcard_decks
for each row execute function private.set_updated_at();

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null,
  user_id uuid not null,
  position integer not null default 0,
  front text not null check (char_length(front) between 1 and 2000),
  back text not null check (char_length(back) between 1 and 4000),
  state public.flashcard_state not null default 'new',
  due_at timestamptz not null default now(),
  stability real check (stability >= 0),
  difficulty real check (difficulty between 1 and 10),
  scheduled_days integer not null default 0 check (scheduled_days >= 0),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (deck_id, user_id) references public.flashcard_decks (id, user_id) on delete cascade
);
create index flashcards_deck_user_idx on public.flashcards (deck_id, user_id);
create index flashcards_user_due_idx on public.flashcards (user_id, due_at);

create trigger flashcards_set_updated_at before update on public.flashcards
for each row execute function private.set_updated_at();

create function private.count_deck_cards() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.flashcard_decks d
  set card_count = (select count(*) from public.flashcards where deck_id = d.id)
  where d.id = coalesce(new.deck_id, old.deck_id);
  return null;
end;
$$;

create trigger flashcards_count after insert or delete on public.flashcards
for each row execute function private.count_deck_cards();

create table public.flashcard_reviews (
  id bigint generated always as identity primary key,
  card_id uuid not null,
  user_id uuid not null,
  -- FSRS ratings: 1 again ("unknown"), 2 hard, 3 good, 4 easy ("known").
  rating smallint not null check (rating between 1 and 4),
  state_before public.flashcard_state not null,
  scheduled_days integer not null check (scheduled_days >= 0),
  duration_ms integer check (duration_ms between 0 and 3600000),
  reviewed_at timestamptz not null default now(),
  foreign key (card_id, user_id) references public.flashcards (id, user_id) on delete cascade
);
create index flashcard_reviews_card_user_idx on public.flashcard_reviews (card_id, user_id);
create index flashcard_reviews_user_recent_idx on public.flashcard_reviews (user_id, reviewed_at desc);

alter table public.flashcard_decks enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_reviews enable row level security;

create policy "Users manage their own decks" on public.flashcard_decks
for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users manage their own cards" on public.flashcards
for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users read their own reviews" on public.flashcard_reviews
for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.flashcard_decks, public.flashcards, public.flashcard_reviews from anon, authenticated;
grant select, delete on public.flashcard_decks, public.flashcards to authenticated;
grant insert (id, user_id, document_id, title) on public.flashcard_decks to authenticated;
grant update (title) on public.flashcard_decks to authenticated;
grant insert (id, deck_id, user_id, position, front, back) on public.flashcards to authenticated;
grant update (position, front, back) on public.flashcards to authenticated;
grant select on public.flashcard_reviews to authenticated;

create function public.review_flashcard(
  p_card_id uuid,
  p_rating smallint,
  p_next_state public.flashcard_state,
  p_due_at timestamptz,
  p_stability real,
  p_difficulty real,
  p_scheduled_days integer,
  p_duration_ms integer default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_card public.flashcards%rowtype;
begin
  select * into v_card from public.flashcards
  where id = p_card_id and user_id = v_user
  for update;
  if not found then
    raise exception 'card not found' using errcode = 'no_data_found';
  end if;

  insert into public.flashcard_reviews (card_id, user_id, rating, state_before, scheduled_days, duration_ms)
  values (v_card.id, v_user, p_rating, v_card.state, p_scheduled_days, p_duration_ms);

  update public.flashcards set
    state = p_next_state,
    due_at = p_due_at,
    stability = p_stability,
    difficulty = p_difficulty,
    scheduled_days = p_scheduled_days,
    reps = reps + 1,
    lapses = lapses + case when p_rating = 1 and v_card.state = 'review' then 1 else 0 end,
    last_reviewed_at = now()
  where id = v_card.id;

  perform private.record_activity(v_user, 'card_reviewed');
  perform private.bump_metric('cards_reviewed');
end;
$$;

grant execute on function public.start_quiz_attempt(uuid) to authenticated;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;
grant execute on function public.review_flashcard(uuid, smallint, public.flashcard_state, timestamptz, real, real, integer, integer)
  to authenticated;
