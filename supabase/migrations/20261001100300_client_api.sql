-- Read APIs for the app that PostgREST cannot express in one request.

/**
 * The caller's conversations with a last-message preview, newest first. Searches titles and
 * message text. SECURITY INVOKER: row level security applies as for direct table reads.
 */
create function public.list_my_conversations(p_query text default null, p_limit integer default 50)
returns table (
  id uuid, document_id uuid, document_title text, title text, preview text,
  message_count integer, last_message_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.document_id, d.title, c.title,
    coalesce(left(regexp_replace(m.content, '\s+', ' ', 'g'), 120), ''),
    c.message_count, coalesce(c.last_message_at, c.created_at)
  from public.conversations c
  left join public.documents d on d.id = c.document_id
  left join lateral (
    select content from public.messages where conversation_id = c.id order by created_at desc limit 1
  ) m on true
  where c.user_id = (select auth.uid())
    and (nullif(trim(p_query), '') is null
      or c.title ilike '%' || trim(p_query) || '%'
      or exists (
        select 1 from public.messages s
        where s.conversation_id = c.id and s.search @@ websearch_to_tsquery('simple', p_query)
      ))
  order by coalesce(c.last_message_at, c.created_at) desc
  limit least(greatest(p_limit, 1), 200);
$$;
grant execute on function public.list_my_conversations(text, integer) to authenticated;

/** The caller's decks with due and new card counts (computed in the database, not the app). */
create function public.list_my_decks()
returns table (id uuid, title text, document_id uuid, card_count integer, due_count integer, new_count integer)
language sql stable security invoker set search_path = '' as $$
  select d.id, d.title, d.document_id, d.card_count,
    count(f.id) filter (where f.state <> 'new' and f.due_at <= now())::integer,
    count(f.id) filter (where f.state = 'new')::integer
  from public.flashcard_decks d
  left join public.flashcards f on f.deck_id = d.id
  where d.user_id = (select auth.uid())
  group by d.id
  order by d.updated_at desc;
$$;
grant execute on function public.list_my_decks() to authenticated;

/** Quizzes with the caller's best score (percent) and last attempt. */
create function public.list_my_quizzes()
returns table (
  id uuid, title text, document_id uuid, question_count integer, time_limit_seconds integer,
  best_score integer, last_attempt_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select q.id, q.title, q.document_id, q.question_count, q.time_limit_seconds,
    max(round(100.0 * a.score / nullif(a.max_score, 0)))::integer,
    max(a.submitted_at)
  from public.quizzes q
  left join public.quiz_attempts a on a.quiz_id = q.id and a.status = 'submitted'
  where q.user_id = (select auth.uid())
  group by q.id
  order by q.created_at desc;
$$;
grant execute on function public.list_my_quizzes() to authenticated;
