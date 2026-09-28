begin;
\ir _helpers.psql
select plan(22);

select tests.create_user('reader@example.com') as ada \gset
select tests.create_user('other@example.com') as bob \gset
select tests.create_user('new@example.com', '{}', false) as unverified \gset
select repeat('a', 64) as hash \gset

-- Upload authorization
select * from public.create_document_upload(:'ada', ' Cell biology ', 'pdf', 'application/pdf', 2048, 'pdf') \gset up_
select ok(:'up_allowed'::boolean, 'a verified user within quota may upload');
select ok(:'up_storage_path' = :'ada' || '/' || :'up_document_id' || '/original.pdf', 'the storage path is scoped to the user and document');
select is((select status::text || '|' || title from public.documents where id = :'up_document_id'), 'pending_upload|Cell biology',
  'the document is created pending upload with a trimmed title');
select throws_ok(
  format('select * from public.create_document_upload(%L, %L, %L, %L, 10, %L)', :'ada', 't', 'pdf', 'application/pdf', '../x'),
  '22023', null, 'unsafe file extensions are rejected'
);
select ok(
  not (select allowed from public.create_document_upload(:'unverified', 't', 'pdf', 'application/pdf', 10, 'pdf')),
  'unverified users cannot upload'
);

-- Queueing
select is(public.queue_document_processing(:'up_document_id', :'ada'), 'queued', 'a new file is queued for extraction');
select is(public.queue_document_processing(:'up_document_id', :'ada'), 'already_processing', 'queueing twice is a no-op');
select is(
  (select payload from private.jobs where kind = 'document_extract' and dedupe_key = :'up_document_id'),
  jsonb_build_object('document_id', :'up_document_id'),
  'the job payload holds only the document id'
);
select throws_ok(
  format('select public.queue_document_processing(%L, %L)', :'up_document_id', :'bob'),
  'P0002', null, 'a user cannot queue another user''s document'
);
select ok(
  (select max_pages > 0 and full_context_max_tokens > 0 and chunk_target_tokens > 0
   from public.get_document_for_processing(:'up_document_id')),
  'the worker receives the plan''s page limit and retrieval settings'
);

-- Saving the extraction (idempotent)
select is(public.reuse_document_extraction(:'up_document_id', :'hash'), false, 'a first-seen file must be extracted');
select public.save_document_extraction(:'up_document_id',
  '[{"number": 1, "text": "Cells are the unit of life."}, {"number": 2, "text": "Mitochondria.", "ocr": true}]',
  '[{"index": 0, "page_start": 1, "page_end": 2, "content": "Cells are the unit of life. Mitochondria.", "tokens": 9}]',
  9, 'en', 'english', 'full_context', 1::smallint);
select public.save_document_extraction(:'up_document_id',
  '[{"number": 1, "text": "Cells are the unit of life."}, {"number": 2, "text": "Mitochondria.", "ocr": true}]',
  '[{"index": 0, "page_start": 1, "page_end": 2, "content": "Cells are the unit of life. Mitochondria.", "tokens": 9}]',
  9, 'en', 'english', 'full_context', 1::smallint);
select is(
  (select status::text || '|' || page_count || '|' || ts_config::text || '|' || (processed_at is not null)
   from public.documents where id = :'up_document_id'),
  'ready|2|english|true',
  'a saved extraction makes the document ready'
);
select is(
  (select count(*)::int from public.document_pages where document_id = :'up_document_id')
    + (select count(*)::int from public.document_chunks where document_id = :'up_document_id'),
  3, 'saving again replaces the text instead of duplicating it'
);
select is(public.queue_document_processing(:'up_document_id', :'ada'), 'already_ready', 'a ready document is not reprocessed');

-- Extract once: the same file uploaded again by the same user reuses the text
select document_id as copy from public.create_document_upload(:'ada', 'Copy', 'pdf', 'application/pdf', 2048, 'pdf') \gset
select public.queue_document_processing(:'copy', :'ada');
select is(public.reuse_document_extraction(:'copy', :'hash'), true, 'an identical file is served from the extraction cache');
select is((select status::text from public.documents where id = :'copy'), 'ready', 'a cache hit makes the document ready');
select is(
  (select string_agg(content, ' ' order by page_number) from public.document_pages where document_id = :'copy'),
  'Cells are the unit of life. Mitochondria.',
  'cached pages are copied to the new document'
);

-- No cache sharing between users (privacy)
select document_id as bobs from public.create_document_upload(:'bob', 'Same file', 'pdf', 'application/pdf', 2048, 'pdf') \gset
select public.queue_document_processing(:'bobs', :'bob');
select is(public.reuse_document_extraction(:'bobs', :'hash'), false, 'another user''s identical file is extracted separately');

-- Large documents get embeddings; failures and stuck documents surface
select public.save_document_extraction(:'bobs', '[{"number": 1, "text": "x"}]', '[]', 200000, 'en', 'english', 'hybrid', 1::smallint);
select ok(exists (select 1 from private.jobs where kind = 'document_embed' and dedupe_key = :'bobs'),
  'hybrid documents are queued for embeddings');

select document_id as stuck from public.create_document_upload(:'bob', 'Stuck', 'pdf', 'application/pdf', 10, 'pdf') \gset
alter table public.documents disable trigger documents_set_updated_at;
update public.documents set status = 'processing', updated_at = now() - interval '1 hour' where id = :'stuck';
alter table public.documents enable trigger documents_set_updated_at;
select private.run_maintenance();
select is((select status::text || '|' || error_code from public.documents where id = :'stuck'), 'failed|processing_timeout',
  'maintenance fails documents stuck in processing without a job');

-- Storage janitor
insert into private.storage_deletion_queue (bucket_id, path_prefix) values ('documents', 'x/'), ('documents', 'y/');
select is((select count(*)::int from public.claim_storage_deletions(10)), 2, 'the janitor claims queued deletions');
select public.finish_storage_deletion(id, case when path_prefix = 'y/' then 'boom' end)
from private.storage_deletion_queue where path_prefix in ('x/', 'y/');
select is(
  (select array_agg(path_prefix || ':' || last_error) from private.storage_deletion_queue where path_prefix in ('x/', 'y/')),
  array['y/:boom'], 'finished deletions leave the queue; failures stay with their error for a retry'
);

select * from finish();
rollback;
