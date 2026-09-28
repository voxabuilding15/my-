begin;
\ir _helpers.psql
select plan(21);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('bob@example.com') as bob \gset
select tests.create_user('new@example.com', '{}', false) as unverified \gset
select tests.create_document(:'ada') as doc \gset
update public.documents set page_count = 3 where id = :'doc';
update public.plan_limits set ai_requests_per_day = 2, quizzes_per_day = 1 where tier = 'free';

-- Admission
select is((select remaining from public.begin_ai_request(:'ada', array['ai_requests']::public.usage_metric[])), 1,
  'an admitted request reports the remaining quota');
select is((select reason from public.begin_ai_request(:'unverified', array['ai_requests']::public.usage_metric[])), 'email_unverified',
  'unverified accounts cannot use AI');
select is((select allowed from public.begin_ai_request(:'ada', array['ai_requests', 'quizzes']::public.usage_metric[])), true,
  'a quiz draws from both the AI and the quiz quota');
select is((select reason from public.begin_ai_request(:'ada', array['ai_requests', 'quizzes']::public.usage_metric[])), 'quota_exceeded',
  'requests stop at the plan limit');
select is(
  (select used from public.usage_counters where user_id = :'ada' and metric = 'ai_requests'), 2,
  'a refused multi-quota request gives back what it had already taken'
);
select is((select allowed from public.begin_ai_request(:'ada', array['chat_messages']::public.usage_metric[])), true,
  'chat has its own quota');

-- Failures are free
select public.finish_ai_request(:'ada', 'summarize', array['ai_requests']::public.usage_metric[], false, 'claude-sonnet-5-5', 1000, 0, 0, 2000, 900);
select is((select used from public.usage_counters where user_id = :'ada' and metric = 'ai_requests'), 1,
  'a failed request returns its quota');
select is((select succeeded from public.usage_events where user_id = :'ada'), false, 'failed calls are still recorded for cost tracking');
select public.finish_ai_request(:'ada', 'summarize', array['ai_requests']::public.usage_metric[], true, 'claude-sonnet-5-5', 1000, 200, 5000, 4000, 1200);
select ok((select sum(value) from analytics.daily_metrics where metric = 'ai_cost_micros') >= 6000, 'cost is aggregated for the daily budget');

-- Kill switch, budget, rate limit
update public.app_config set value = 'false' where key = 'ai.enabled';
select is((select reason from public.begin_ai_request(:'bob', array['ai_requests']::public.usage_metric[])), 'ai_disabled', 'the kill switch stops all AI');
update public.app_config set value = 'true' where key = 'ai.enabled';
update public.app_config set value = '0.001' where key = 'ai.daily_budget_usd';
select is((select reason from public.begin_ai_request(:'bob', array['ai_requests']::public.usage_metric[])), 'budget_exceeded', 'the daily budget stops AI');
update public.app_config set value = '200' where key = 'ai.daily_budget_usd';
update public.app_config set value = '{"per_minute": 1, "per_hour": 100}' where key = 'ai.rate_limits';
select public.begin_ai_request(:'bob', array['chat_messages']::public.usage_metric[]);
select is((select reason from public.begin_ai_request(:'bob', array['chat_messages']::public.usage_metric[])), 'rate_limited', 'bursts are rate limited');

-- Generated quizzes and decks
select public.save_generated_quiz(:'ada', :'doc', 'Cells', 600, 'claude-sonnet-5-5', '[
  {"type": "multiple_choice", "prompt": "Powerhouse?", "choices": ["Nucleus", "Mitochondria"], "correct_answer": "Mitochondria", "explanation": "See page 2", "source_page": 2},
  {"type": "true_false", "prompt": "Cells are alive.", "choices": null, "correct_answer": "true", "explanation": "", "source_page": 99}
]') as quiz \gset
select is((select question_count from public.quizzes where id = :'quiz'), 2, 'a generated quiz is saved with all its questions');
select is((select array_agg(source_page order by position) from public.quiz_questions where quiz_id = :'quiz'), array[2, null]::integer[],
  'pages outside the document are dropped');
select throws_ok(format('select public.save_generated_quiz(%L, %L, %L, null, %L, %L)', :'bob', :'doc', 'x', 'm', '[]'), 'P0002', null,
  'material cannot be generated from another user''s document');
select public.save_generated_deck(:'ada', :'doc', 'Cells deck', '[{"front": "ATP?", "back": "Energy"}, {"front": "DNA?", "back": "Genes"}]') as deck \gset
select is((select card_count from public.flashcard_decks where id = :'deck'), 2, 'a generated deck is saved with its cards, due now');

-- Embeddings
insert into public.document_chunks (id, document_id, user_id, chunk_index, page_start, page_end, content, token_count)
values ('00000000-0000-0000-0000-0000000000c1', :'doc', :'ada', 0, 1, 1, 'chunk one', 2),
       ('00000000-0000-0000-0000-0000000000c2', :'doc', :'ada', 1, 2, 2, 'chunk two', 2);
select id as model from public.get_active_embedding_model() \gset
select is((select count(*)::int from public.get_chunks_to_embed(:'doc', :'model'::smallint)), 2, 'chunks without vectors are listed');
select is(
  public.save_chunk_embeddings(:'doc', :'model'::smallint, jsonb_build_array(jsonb_build_object(
    'chunk_id', '00000000-0000-0000-0000-0000000000c1', 'embedding', to_jsonb(array_fill(0.1, array[1024]))))),
  1, 'vectors are saved'
);
select is((select count(*)::int from public.get_chunks_to_embed(:'doc', :'model'::smallint)), 1, 'embedding resumes where it stopped');

-- Reports
insert into public.conversations (id, user_id, document_id) values ('00000000-0000-0000-0000-0000000000f1', :'ada', :'doc');
insert into public.messages (id, conversation_id, user_id, role, content, model) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', :'ada', 'assistant', 'Mitochondria make glucose.', 'claude-haiku-4-5');
set local role authenticated;
select tests.as_user(:'ada');
insert into public.content_reports (reporter_id, target_type, target_id, reason) values (:'ada', 'message', '00000000-0000-0000-0000-0000000000e1', 'incorrect');
reset role;
select is((select content_snapshot || '|' || model from public.content_reports), 'Mitochondria make glucose.|claude-haiku-4-5',
  'the reported answer is kept for reviewers');
set local role authenticated;
select tests.as_user(:'bob');
select throws_ok(
  format('insert into public.content_reports (reporter_id, target_type, target_id, reason) values (%L, %L, %L, %L)',
    :'bob', 'message', '00000000-0000-0000-0000-0000000000e1', 'harmful'),
  'P0002', null, 'users can only report answers they received'
);
reset role;

select * from finish();
rollback;
