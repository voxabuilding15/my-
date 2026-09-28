-- Documents, extracted text, retrieval chunks, embeddings, bookmarks and file storage.
--
-- Ownership integrity: child rows carry a denormalised user_id (so RLS checks are a simple
-- indexed equality instead of a join) and a composite foreign key (parent_id, user_id) to the
-- parent's (id, user_id). A user therefore cannot attach rows to someone else's document, even
-- if they guess its id.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  kind public.document_kind not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  storage_path text not null unique,
  status public.document_status not null default 'pending_upload',
  error_code text,
  page_count integer check (page_count >= 0),
  language text check (language ~ '^[a-z]{2,3}$'),
  -- Text-search configuration matching the document language ('simple' when unsupported).
  ts_config regconfig not null default 'simple',
  token_count integer check (token_count >= 0),
  retrieval_mode public.retrieval_mode,
  is_favorite boolean not null default false,
  last_page integer check (last_page >= 1),
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index documents_user_recent_idx on public.documents (user_id, created_at desc);
create index documents_user_opened_idx on public.documents (user_id, last_opened_at desc nulls last);
create index documents_user_favorite_idx on public.documents (user_id) where is_favorite;
create index documents_title_trgm_idx on public.documents using gin (title extensions.gin_trgm_ops);

create trigger documents_set_updated_at before update on public.documents
for each row execute function private.set_updated_at();

alter table public.documents enable row level security;

create policy "Users read their own documents" on public.documents
for select to authenticated using (user_id = (select auth.uid()));
create policy "Users update their own documents" on public.documents
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their own documents" on public.documents
for delete to authenticated using (user_id = (select auth.uid()));

-- Rows are created by the upload Edge Function after quota checks; clients may only rename,
-- favourite and record reading progress.
revoke all on public.documents from anon, authenticated;
grant select, delete on public.documents to authenticated;
grant update (title, is_favorite, last_page, last_opened_at) on public.documents to authenticated;

------------------------------------------------------------------------------------------
-- Extracted text, one row per page (used for "explain this page" and full-context mode)
------------------------------------------------------------------------------------------

create table public.document_pages (
  document_id uuid not null,
  user_id uuid not null,
  page_number integer not null check (page_number >= 1),
  content text not null,
  ocr_applied boolean not null default false,
  primary key (document_id, page_number),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);
create index document_pages_user_id_idx on public.document_pages (user_id);

alter table public.document_pages enable row level security;
create policy "Users read their own pages" on public.document_pages
for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.document_pages from anon, authenticated;
grant select on public.document_pages to authenticated;

------------------------------------------------------------------------------------------
-- Retrieval chunks (only for documents in hybrid mode)
------------------------------------------------------------------------------------------

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  user_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  page_start integer not null check (page_start >= 1),
  page_end integer not null,
  content text not null,
  token_count integer not null check (token_count > 0),
  ts_config regconfig not null default 'simple',
  search tsvector generated always as (to_tsvector(ts_config, content)) stored,
  unique (document_id, chunk_index),
  unique (id, user_id),
  check (page_end >= page_start),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);
create index document_chunks_user_id_idx on public.document_chunks (user_id);
create index document_chunks_search_idx on public.document_chunks using gin (search);

alter table public.document_chunks enable row level security;
create policy "Users read their own chunks" on public.document_chunks
for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.document_chunks from anon, authenticated;
grant select on public.document_chunks to authenticated;

------------------------------------------------------------------------------------------
-- Embeddings — provider-agnostic
--
-- Each provider/model/dimension combination is a row in embedding_models; exactly one is
-- active. Vectors are stored untyped and validated against the model's dimensions, so switching
-- provider is: insert a model row, backfill embeddings, flip is_active — no schema change.
--
-- Retrieval is always scoped to one document (or a handful), i.e. at most a few thousand
-- vectors, so exact nearest-neighbour search over the (document_id, model_id) index is both
-- faster and more accurate than an approximate HNSW index with post-filtering.
------------------------------------------------------------------------------------------

create table public.embedding_models (
  id smallint generated always as identity primary key,
  provider text not null,
  model text not null,
  dimensions integer not null check (dimensions between 1 and 4096),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (provider, model, dimensions)
);
create unique index embedding_models_single_active_idx on public.embedding_models (is_active) where is_active;

insert into public.embedding_models (provider, model, dimensions, is_active)
values ('voyage', 'voyage-3.5', 1024, true);

alter table public.embedding_models enable row level security;
create policy "Signed-in users read embedding models" on public.embedding_models
for select to authenticated using (true);
revoke all on public.embedding_models from anon, authenticated;
grant select on public.embedding_models to authenticated;

create table public.document_chunk_embeddings (
  chunk_id uuid not null,
  model_id smallint not null references public.embedding_models (id) on delete cascade,
  document_id uuid not null,
  user_id uuid not null,
  embedding extensions.vector not null,
  created_at timestamptz not null default now(),
  primary key (chunk_id, model_id),
  foreign key (chunk_id, user_id) references public.document_chunks (id, user_id) on delete cascade,
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);
create index document_chunk_embeddings_document_model_idx on public.document_chunk_embeddings (document_id, model_id);
create index document_chunk_embeddings_user_id_idx on public.document_chunk_embeddings (user_id);
create index document_chunk_embeddings_model_id_idx on public.document_chunk_embeddings (model_id);

create function private.check_embedding_dimensions() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_expected integer;
begin
  select dimensions into v_expected from public.embedding_models where id = new.model_id;
  if extensions.vector_dims(new.embedding) <> v_expected then
    raise exception 'embedding has % dimensions, model % expects %',
      extensions.vector_dims(new.embedding), new.model_id, v_expected
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger document_chunk_embeddings_check_dimensions
before insert or update of embedding, model_id on public.document_chunk_embeddings
for each row execute function private.check_embedding_dimensions();

alter table public.document_chunk_embeddings enable row level security;
create policy "Users read their own embeddings" on public.document_chunk_embeddings
for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.document_chunk_embeddings from anon, authenticated;
grant select on public.document_chunk_embeddings to authenticated;

------------------------------------------------------------------------------------------
-- Bookmarks
------------------------------------------------------------------------------------------

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  document_id uuid not null,
  page_number integer not null check (page_number >= 1),
  label text check (char_length(label) <= 120),
  created_at timestamptz not null default now(),
  unique (user_id, document_id, page_number),
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);
create index bookmarks_document_user_idx on public.bookmarks (document_id, user_id);

alter table public.bookmarks enable row level security;
create policy "Users manage their own bookmarks" on public.bookmarks
for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.bookmarks from anon, authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
grant update (label) on public.bookmarks to authenticated;

------------------------------------------------------------------------------------------
-- Storage
--
-- Object paths are "{user_id}/{document_id}/{file}". Uploads to `documents` happen only through
-- signed upload URLs issued by the upload Edge Function (after quota and size checks), so there
-- is deliberately no INSERT policy for clients on that bucket.
------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 52428800, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic'
  ]),
  ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Users read their own document files" on storage.objects
for select to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users read their own avatar" on storage.objects
for select to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users upload their own avatar" on storage.objects
for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users replace their own avatar" on storage.objects
for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users delete their own avatar" on storage.objects
for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Files must be removed through the Storage API (deleting storage.objects rows in SQL would
-- orphan the underlying blobs). Deleting a document or an account enqueues its files here; the
-- storage-janitor Edge Function drains the queue. The queue holds paths only — no user ids.
create table private.storage_deletion_queue (
  id bigint generated always as identity primary key,
  bucket_id text not null,
  path_prefix text not null,
  enqueued_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  unique (bucket_id, path_prefix)
);

create function private.enqueue_document_file_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.storage_deletion_queue (bucket_id, path_prefix)
  values ('documents', old.storage_path)
  on conflict do nothing;
  return old;
end;
$$;

create trigger documents_enqueue_file_deletion after delete on public.documents
for each row execute function private.enqueue_document_file_deletion();

create function private.enqueue_account_file_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.storage_deletion_queue (bucket_id, path_prefix)
  values ('documents', old.id::text || '/'), ('avatars', old.id::text || '/')
  on conflict do nothing;
  return old;
end;
$$;

create trigger profiles_enqueue_file_deletion after delete on public.profiles
for each row execute function private.enqueue_account_file_deletion();

create function private.count_document_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.bump_metric('documents_uploaded', new.kind::text);
  return new;
end;
$$;

create trigger documents_count_upload after insert on public.documents
for each row execute function private.count_document_upload();
