begin;
\ir _helpers.psql
select plan(16);

select tests.create_user('ada@example.com') as ada \gset
select tests.create_user('bob@example.com') as bob \gset
select tests.create_document(:'ada', 'Cell Biology') as doc \gset
select tests.create_document(:'bob', 'Bob private notes') as bob_doc \gset

-- Chunks for hybrid retrieval: one about photosynthesis, one about mitosis.
insert into public.document_chunks (id, document_id, user_id, chunk_index, page_start, page_end, content, token_count, ts_config)
values
  ('00000000-0000-0000-0000-00000000c001', :'doc', :'ada', 0, 1, 1, 'Photosynthesis converts light energy into chemical energy in chloroplasts.', 12, 'english'),
  ('00000000-0000-0000-0000-00000000c002', :'doc', :'ada', 1, 2, 3, 'Mitosis is the division of a cell nucleus into two identical nuclei.', 12, 'english');

-- 3-dimensional test model (the seeded production model is 1024-d).
insert into public.embedding_models (provider, model, dimensions) values ('test', 'tiny', 3);
update public.embedding_models set is_active = false where is_active;
update public.embedding_models set is_active = true where model = 'tiny';
select id as model_id from public.embedding_models where model = 'tiny' \gset

insert into public.document_chunk_embeddings (chunk_id, model_id, document_id, user_id, embedding) values
  ('00000000-0000-0000-0000-00000000c001', :model_id, :'doc', :'ada', '[1,0,0]'),
  ('00000000-0000-0000-0000-00000000c002', :model_id, :'doc', :'ada', '[0,1,0]');

select throws_ok(
  format('insert into public.document_chunk_embeddings (chunk_id, model_id, document_id, user_id, embedding) values (%L, %s, %L, %L, %L)',
    '00000000-0000-0000-0000-00000000c001', :model_id, :'doc', :'ada', '[1,0]'),
  '23514', null, 'an embedding with the wrong dimensions is rejected'
);

select throws_ok(
  format('insert into public.document_chunks (document_id, user_id, chunk_index, page_start, page_end, content, token_count) values (%L, %L, 9, 1, 1, %L, 1)',
    :'doc', :'bob', 'x'),
  '23503', null, 'a chunk cannot be attributed to a user who does not own the document'
);

set local role authenticated;
select tests.as_user(:'ada');

select is((select count(*)::int from public.documents), 1, 'a user sees only their own documents');
select throws_ok(
  format('insert into public.documents (user_id, title, kind, mime_type, size_bytes, storage_path) values (%L, %L, %L, %L, 1, %L)',
    :'ada', 'sneaky', 'pdf', 'application/pdf', :'ada' || '/x/y.pdf'),
  '42501', null, 'clients cannot create documents directly (quota bypass)'
);
select lives_ok(
  format('update public.documents set title = %L, is_favorite = true, last_page = 4 where id = %L', 'Renamed', :'doc'),
  'a user can rename, favourite and track progress on their document'
);
select throws_ok(
  format('update public.documents set storage_path = %L where id = %L', :'bob' || '/steal.pdf', :'doc'),
  '42501', null, 'a user cannot repoint a document at another storage path'
);
select is(
  (select count(*)::int from public.documents where id = :'bob_doc'),
  0, 'another user''s document is invisible even by id'
);
select throws_ok(
  format('insert into public.bookmarks (user_id, document_id, page_number) values (%L, %L, 1)', :'ada', :'bob_doc'),
  '23503', null, 'a user cannot bookmark someone else''s document'
);
select lives_ok(
  format('insert into public.bookmarks (user_id, document_id, page_number, label) values (%L, %L, 2, %L)', :'ada', :'doc', 'Mitosis'),
  'a user can bookmark a page of their own document'
);

-- Hybrid retrieval
select is(
  (select chunk_id from public.match_document_chunks(array[:'doc'::uuid], 'photosynthesis light') limit 1),
  '00000000-0000-0000-0000-00000000c001'::uuid,
  'full-text search alone finds the relevant chunk (embedding provider down)'
);
select is(
  (select array_agg(chunk_id) from public.match_document_chunks(array[:'doc'::uuid], 'how do organisms reproduce', '[0.1,0.9,0]', 1)),
  array['00000000-0000-0000-0000-00000000c002'::uuid],
  'semantic search finds the answer when no keywords overlap'
);

select tests.as_user(:'bob');
select is(
  (select count(*)::int from public.match_document_chunks(array[:'doc'::uuid], 'photosynthesis', '[1,0,0]')),
  0, 'retrieval never returns another user''s chunks'
);

-- Storage policies (path = "{user_id}/...")
reset role;
insert into storage.objects (bucket_id, name) values
  ('documents', :'ada' || '/d1/file.pdf'), ('documents', :'bob' || '/d2/file.pdf');
set local role authenticated;
select tests.as_user(:'ada');
select is((select count(*)::int from storage.objects where bucket_id = 'documents'), 1, 'a user can only read their own files');
select throws_ok(
  format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'documents', :'ada' || '/x/evil.pdf'),
  '42501', null, 'clients cannot upload documents without a signed upload URL'
);
select throws_ok(
  format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'avatars', :'bob' || '/avatar.png'),
  '42501', null, 'a user cannot write into another user''s avatar folder'
);

-- Deleting a document queues its file for removal from storage
delete from public.documents where id = :'doc';
reset role;
select ok(
  exists (select 1 from private.storage_deletion_queue where bucket_id = 'documents' and path_prefix like :'ada' || '/%'),
  'deleting a document queues its file for deletion'
);

select * from finish();
rollback;
