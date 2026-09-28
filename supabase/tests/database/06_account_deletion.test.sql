begin;
\ir _helpers.psql
select plan(9);

select tests.create_user('leaver@example.com', '{"full_name": "Leaving User"}') as leaver \gset
select tests.create_user('stayer@example.com') as stayer \gset
select tests.make_admin(:'leaver');

-- Give the user data in every feature area.
select tests.create_document(:'leaver') as doc \gset
insert into public.document_pages (document_id, user_id, page_number, content) values (:'doc', :'leaver', 1, 'page text');
insert into public.document_chunks (id, document_id, user_id, chunk_index, page_start, page_end, content, token_count)
values ('00000000-0000-0000-0000-0000000000c1', :'doc', :'leaver', 0, 1, 1, 'chunk', 1);
insert into public.document_chunk_embeddings (chunk_id, model_id, document_id, user_id, embedding)
select '00000000-0000-0000-0000-0000000000c1', id, :'doc', :'leaver', array_fill(0.1, array[1024])::extensions.vector
from public.embedding_models where is_active;
insert into public.bookmarks (user_id, document_id, page_number) values (:'leaver', :'doc', 1);
insert into public.conversations (id, user_id, document_id) values ('00000000-0000-0000-0000-0000000000f1', :'leaver', :'doc');
insert into public.messages (conversation_id, user_id, role, content) values ('00000000-0000-0000-0000-0000000000f1', :'leaver', 'user', 'hi');
insert into public.ai_outputs (user_id, document_id, action, content, model) values (:'leaver', :'doc', 'summarize', '{}', 'm');
insert into public.notes (user_id, title) values (:'leaver', 'note');
insert into public.quizzes (id, user_id, title) values ('00000000-0000-0000-0000-0000000000a1', :'leaver', 'quiz');
insert into public.quiz_questions (id, quiz_id, user_id, position, type, prompt, correct_answer)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', :'leaver', 0, 'true_false', 'q', 'true');
insert into public.quiz_attempts (id, quiz_id, user_id) values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', :'leaver');
insert into public.quiz_answers (attempt_id, question_id, quiz_id, user_id, answer)
values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', :'leaver', 'true');
insert into public.flashcard_decks (id, user_id, title) values ('00000000-0000-0000-0000-0000000000d1', :'leaver', 'deck');
insert into public.flashcards (id, deck_id, user_id, front, back) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', :'leaver', 'f', 'b');
insert into public.flashcard_reviews (card_id, user_id, rating, state_before, scheduled_days) values ('00000000-0000-0000-0000-0000000000e1', :'leaver', 3, 'new', 1);
insert into public.usage_events (user_id, tier, action, model, cost_micros) values (:'leaver', 'free', 'summarize', 'm', 100);
select public.consume_quota(:'leaver', 'ai_requests');
insert into public.error_logs (user_id, message) values (:'leaver', 'err');
insert into public.content_reports (reporter_id, target_type, reason) values (:'leaver', 'other', 'other');
insert into public.push_tokens (token, user_id, platform) values ('tok', :'leaver', 'android');
select public.issue_email_code(:'leaver', 'verify_email', 'code-hash');
insert into public.billing_events (id, user_id, type, payload) values ('evt_1', :'leaver', 'INITIAL_PURCHASE', jsonb_build_object('app_user_id', :'leaver'));

-- The user edits config as an admin, leaving audit rows that reference them.
set local role authenticated;
select tests.as_user(:'leaver');
update public.plan_limits set storage_mb = 200 where tier = 'free';

-- Data export (GDPR Art. 15/20) covers every area before deletion.
select ok(
  (select public.export_my_data() ?& array['profile', 'documents', 'messages', 'notes', 'quizzes', 'flashcards', 'usage_events']),
  'data export includes every feature area'
);
select is(
  (select jsonb_array_length(public.export_my_data() -> 'messages')), 1, 'data export contains the user''s rows'
);
reset role;
select tests.clear_user();

select set_config('tests.leaver', :'leaver', true);

-- Delete the account (what the delete-account Edge Function does via auth.admin.deleteUser).
delete from auth.users where id = :'leaver';

create temp table leftovers (location text);
do $$
declare
  v_id text := current_setting('tests.leaver');
  col record;
  n bigint;
begin
  for col in
    select c.table_schema, c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema in ('public', 'private', 'analytics', 'auth')
      and t.table_type = 'BASE TABLE'
      and c.data_type in ('uuid', 'text', 'jsonb')
      and not (c.table_schema = 'private' and c.table_name = 'storage_deletion_queue')
  loop
    execute format('select count(*) from %I.%I where %I::text like %L', col.table_schema, col.table_name, col.column_name, '%' || v_id || '%')
    into n;
    if n > 0 then
      insert into leftovers values (col.table_schema || '.' || col.table_name || '.' || col.column_name);
    end if;
  end loop;
end;
$$;

select is(array(select location from leftovers), '{}'::text[], 'no trace of the user remains in any table or column');

select ok(
  exists (select 1 from private.storage_deletion_queue where bucket_id = 'documents' and path_prefix = :'leaver' || '/')
    and exists (select 1 from private.storage_deletion_queue where bucket_id = 'avatars' and path_prefix = :'leaver' || '/'),
  'all of the user''s files are queued for deletion from storage'
);
select ok(
  (select sum(value) from analytics.daily_metrics where metric = 'accounts_deleted') >= 1,
  'the deletion is counted anonymously'
);
select ok(
  (select sum(value) from analytics.daily_metrics where metric = 'ai_cost_micros' and dimension = 'm') = 100,
  'anonymous AI cost aggregates survive the deletion'
);
select is(
  (select count(*)::int from public.admin_audit_log where admin_id is null and target = 'plan_limits'),
  1, 'audit entries are kept but no longer identify the deleted admin'
);
select is((select updated_by from public.plan_limits where tier = 'free'), null, 'config authorship is anonymised');
select ok(exists (select 1 from public.profiles where id = :'stayer'), 'other users are unaffected');

select * from finish();
rollback;
