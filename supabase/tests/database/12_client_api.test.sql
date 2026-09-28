begin;
\ir _helpers.psql
select plan(6);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('bob@example.com') as bob \gset
select tests.create_document(:'ada', 'Cell biology') as doc \gset
insert into public.conversations (id, user_id, document_id, title) values
  ('00000000-0000-0000-0000-0000000000c1', :'ada', :'doc', 'Mitochondria'),
  ('00000000-0000-0000-0000-0000000000c2', :'ada', null, 'Exam tips'),
  ('00000000-0000-0000-0000-0000000000c3', :'bob', null, 'Bob''s chat');
insert into public.messages (conversation_id, user_id, role, content, created_at) values
  ('00000000-0000-0000-0000-0000000000c1', :'ada', 'user', 'What do mitochondria do?', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-0000000000c1', :'ada', 'assistant', E'They   produce\nenergy (ATP).', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-0000000000c2', :'ada', 'user', 'How should I revise photosynthesis?', now());

insert into public.flashcard_decks (id, user_id, title) values ('00000000-0000-0000-0000-0000000000d1', :'ada', 'Cells');
insert into public.flashcards (deck_id, user_id, front, back, state, due_at) values
  ('00000000-0000-0000-0000-0000000000d1', :'ada', 'a', 'b', 'new', now()),
  ('00000000-0000-0000-0000-0000000000d1', :'ada', 'c', 'd', 'review', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000d1', :'ada', 'e', 'f', 'review', now() + interval '3 days');
insert into public.quizzes (id, user_id, title) values ('00000000-0000-0000-0000-0000000000a1', :'ada', 'Quiz');
insert into public.quiz_attempts (quiz_id, user_id, status, submitted_at, score, max_score) values
  ('00000000-0000-0000-0000-0000000000a1', :'ada', 'submitted', now(), 3, 4),
  ('00000000-0000-0000-0000-0000000000a1', :'ada', 'submitted', now() - interval '1 day', 1, 4),
  ('00000000-0000-0000-0000-0000000000a1', :'ada', 'in_progress', null, null, null);

set local role authenticated;
select tests.as_user(:'ada');
select is(
  (select card_count || '/' || due_count || '/' || new_count from public.list_my_decks()), '3/1/1',
  'decks report total, due and new cards'
);
select is((select best_score from public.list_my_quizzes()), 75, 'quizzes report the best submitted score');
select is(
  (select array_agg(title order by last_message_at desc) from public.list_my_conversations()),
  array['Exam tips', 'Mitochondria'], 'users list only their own conversations, newest first'
);
select is(
  (select preview || '|' || document_title from public.list_my_conversations() where title = 'Mitochondria'),
  'They produce energy (ATP).|Cell biology', 'each conversation has a one-line preview of its last message'
);
select is(
  (select array_agg(title) from public.list_my_conversations('photosynthesis')), array['Exam tips'],
  'message text is searchable'
);
select is((select count(*)::int from public.list_my_conversations('Bob')), 0, 'other users'' conversations are never found');

select * from finish();
rollback;
